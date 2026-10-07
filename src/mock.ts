// The mock itself: one pure function from request to response. The hosted server and the MSW
// handlers are thin adapters over handleRequest, so they always behave identically.
//
// Unofficial. Not affiliated with NIPOST or the Federal Ministry of Communications, Innovation
// and Digital Economy.

import {
  disassemble, format, normaliseSegment, parse, parsePartial, PostcodeFormatError, SEGMENT_ORDER,
  type SegmentName, type Segments,
} from './format'
import { KNOWN_STATES, NIGERIA_BBOX, SANDBOX_POSTCODES, TEST_POSTCODES } from './data'
import { docsPage } from './docs'
import { LIVE_KEY_PREFIX, RATE_LIMIT, RESERVED_KEYS, SANDBOX_KEY_PREFIX } from './keys'
import { mockOpenApi } from './openapi'
import {
  administrativeAddress, buildingUse, otherBuildingInfo, pointGeometry, postcodeAt, recentAddress,
  referenceAreas, referenceDistricts, referenceLgas, referenceStates, round, stateName,
} from './synth'
import type {
  AreasResponse, AssembleResponse, AutocompleteResponse, DisassembleResponse, DistrictsResponse,
  LgasResponse, LookupLevel, LookupResponse, NearbyResponse, ReverseResponse, StatesResponse,
} from './types'

export { SANDBOX_POSTCODES, TEST_POSTCODES } from './data'

export { LIVE_KEY_PREFIX, RATE_LIMIT, RESERVED_KEYS, SANDBOX_KEY_PREFIX } from './keys'

/** The spec clamps reverse search at 250m. Nearby has no published ceiling; the widget variant's 300m is used. */
const REVERSE_MAX_M = 250
const REVERSE_DEFAULT_M = 25
const NEARBY_MAX_M = 300
const NEARBY_RESULTS = 5
const AUTOCOMPLETE_LIMIT = 20

const ROUTES = [
  '/v1/lookup', '/v1/assembly/assemble', '/v1/assembly/disassemble',
  '/v1/search/autocomplete', '/v1/search/reverse', '/v1/search/nearby',
  '/v1/reference/states', '/v1/reference/lgas', '/v1/reference/districts', '/v1/reference/areas',
]

export interface MockRequest {
  method: string
  /** Absolute URL, or a path with query string. */
  url: string | URL
  headers?: Headers | Record<string, string | undefined>
  /** Parsed JSON body, for POST /v1/assembly/assemble. */
  body?: unknown
}

export interface MockResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

const respond = (opts: { status: number, body: unknown, headers?: Record<string, string> }): MockResponse => {
  return {
    status: opts.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Mock': 'true',
      'X-RateLimit-Limit': String(RATE_LIMIT),
      'X-RateLimit-Remaining': String(RATE_LIMIT - 1),
      ...opts.headers,
    },
    body: opts.body,
  }
}

const fail = (opts: { status: number, code: string, message: string, headers?: Record<string, string> }): MockResponse => {
  return respond({
    status: opts.status,
    body: { error: { code: opts.code, message: opts.message }, mock: true },
    headers: opts.headers,
  })
}

const badRequest = (message: string): MockResponse => {
  return fail({ status: 400, code: 'invalid_request', message })
}

const ok = <T>(data: T): MockResponse => {
  return respond({ status: 200, body: { data, mock: true } })
}

const headerValue = (headers: MockRequest['headers'], name: string): string | undefined => {
  if (!headers) {
    return undefined
  }
  // Duck-typed: a Headers from another realm (MSW, undici) fails instanceof.
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined
  }
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers as Record<string, string | undefined>)) {
    if (k.toLowerCase() === lower) {
      return v
    }
  }
  return undefined
}

interface Access {
  maxLevel: LookupLevel
  noCredits: boolean
  noScope: boolean
  /** A sandbox key (`nipost_test_…`): only SANDBOX_POSTCODES resolve. */
  sandbox: boolean
  /** A live key (`nipost_live_…`): the sandbox postcodes do not resolve. */
  live: boolean
}

/** Applies the reserved-key behaviours. Returns an error response, or the access the key grants. */
const authorise = (key: string | undefined): MockResponse | Access => {
  const access: Access = { maxLevel: 5, noCredits: false, noScope: false, sandbox: false, live: false }
  if (!key) {
    return access
  }
  switch (key) {
    case RESERVED_KEYS.invalid:
      return fail({ status: 401, code: 'invalid_api_key', message: 'the API key is not recognised (mock: reserved key mock_invalid)' })
    case RESERVED_KEYS.noKey:
      return fail({ status: 401, code: 'auth_required', message: 'an API key is required; pass it in the X-API-Key header' })
    case RESERVED_KEYS.rateLimited:
      return fail({
        status: 429,
        code: 'rate_limited',
        message: 'rate limit exceeded (mock: reserved key mock_rate_limited)',
        headers: { 'X-RateLimit-Remaining': '0', 'Retry-After': '60' },
      })
    case RESERVED_KEYS.noCredits:
      return { ...access, noCredits: true }
    case RESERVED_KEYS.noScope:
      return { ...access, noScope: true }
  }
  const level = /^mock_level_([1-5])$/.exec(key)?.[1]
  if (level) {
    return { ...access, maxLevel: Number(level) as LookupLevel }
  }
  if (key.startsWith(SANDBOX_KEY_PREFIX)) {
    return { ...access, sandbox: true }
  }
  if (key.startsWith(LIVE_KEY_PREFIX)) {
    return { ...access, live: true }
  }
  return access
}

const isError = (value: MockResponse | object): value is MockResponse => {
  return 'status' in value
}

const lookup = (params: URLSearchParams, access: Access): MockResponse => {
  const code = params.get('code')
  if (!code) {
    return badRequest('code is required')
  }
  const levelParam = params.get('level') ?? '1'
  if (!/^[1-5]$/.test(levelParam)) {
    return badRequest('level must be an integer from 1 to 5')
  }
  const requested = Number(levelParam) as LookupLevel
  if (requested >= 2 && access.noScope) {
    return fail({
      status: 403,
      code: 'level_not_granted',
      message: `lookup level ${requested} has not been granted to this organisation (mock: reserved key mock_no_scope)`,
    })
  }
  if (requested >= 2 && access.noCredits) {
    return fail({ status: 402, code: 'insufficient_credits', message: 'not enough credits; top up to continue' })
  }
  const level = Math.min(requested, access.maxLevel)

  const parsed = parse(code)
  if (!parsed) {
    return ok<LookupResponse>({ postcode: code, valid: false })
  }
  if (access.sandbox && !SANDBOX_POSTCODES.includes(parsed.postcode)) {
    return ok<LookupResponse>({ postcode: parsed.postcode, valid: false })
  }
  if (access.live && SANDBOX_POSTCODES.includes(parsed.postcode)) {
    return ok<LookupResponse>({ postcode: parsed.postcode, valid: false })
  }
  const data: LookupResponse = { postcode: parsed.postcode, valid: true }
  if (level >= 2) {
    data.administrative_address = administrativeAddress(parsed)
    data.recent_house_address = { recent: recentAddress(parsed) }
  }
  if (level >= 3) {
    data.building_use_status = buildingUse(parsed)
  }
  if (level >= 4) {
    data.other_building_info = otherBuildingInfo(parsed)
  }
  if (level >= 5) {
    data.point_geometry = pointGeometry(parsed)
  }
  return ok(data)
}

const assembleRoute = (body: unknown): MockResponse => {
  if (!body || typeof body !== 'object') {
    return badRequest('expected a JSON body with state, lga, district, area and unit')
  }
  try {
    return ok<AssembleResponse>(format(body as Segments))
  }
  catch (err) {
    if (err instanceof PostcodeFormatError) {
      return fail({ status: 400, code: 'invalid_segments', message: err.message })
    }
    throw err
  }
}

const disassembleRoute = (params: URLSearchParams): MockResponse => {
  const code = params.get('code')
  if (!code) {
    return badRequest('code is required')
  }
  try {
    return ok<DisassembleResponse>(disassemble(code))
  }
  catch (err) {
    if (err instanceof PostcodeFormatError) {
      return fail({ status: 400, code: 'invalid_postcode', message: err.message })
    }
    throw err
  }
}

const TEST_SEGMENTS: Segments[] = TEST_POSTCODES.map(code => disassemble(code))
const SANDBOX_SEGMENTS: Segments[] = SANDBOX_POSTCODES.map(code => disassemble(code))

/** Suggests from the postcodes the key can resolve: the sandbox ones for a sandbox key. */
const autocomplete = (params: URLSearchParams, access: Access): MockResponse => {
  const q = params.get('q')
  if (q === null) {
    return badRequest('q is required')
  }
  const partial = parsePartial(q)
  if (!partial) {
    return badRequest('q is not the start of a postcode')
  }
  const { complete, active, fragment } = partial
  const prefix = SEGMENT_ORDER.slice(0, SEGMENT_ORDER.indexOf(active))
  let source = TEST_SEGMENTS
  if (access.sandbox) {
    source = SANDBOX_SEGMENTS
  }
  const labels = new Map<string, string>()
  for (const s of source) {
    const matchesPrefix = prefix.every(name => s[name] === complete[name])
    const value = s[active]
    if (!matchesPrefix || !value.startsWith(fragment) || labels.has(value)) {
      continue
    }
    const code = [...prefix.map(name => s[name]), value].join(' ')
    if (active === 'state') {
      labels.set(value, `${code} (${stateName(value)})`)
    }
    else {
      labels.set(value, code)
    }
  }
  const suggestions = [...labels.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, AUTOCOMPLETE_LIMIT)
    .map(([code, label]) => ({ code, label }))
  return ok<AutocompleteResponse>({ segment: active, suggestions })
}

/** Reads a number parameter. Empty and non-numeric values are errors; a missing one gives `fallback`. */
const numberParam = (opts: { params: URLSearchParams, name: string, fallback?: number }): number | null => {
  const raw = opts.params.get(opts.name)
  if (raw === null && opts.fallback !== undefined) {
    return opts.fallback
  }
  if (raw === null || raw.trim() === '') {
    return null
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return null
  }
  return value
}

const readCoordinate = (params: URLSearchParams): { lng: number, lat: number } | MockResponse => {
  const lng = numberParam({ params, name: 'lng' })
  const lat = numberParam({ params, name: 'lat' })
  if (lng === null || lat === null || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    return badRequest('lng and lat are required: lng from -180 to 180, lat from -90 to 90')
  }
  return { lng, lat }
}

const inNigeria = (lng: number, lat: number): boolean => {
  const b = NIGERIA_BBOX
  return lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat
}

const confidenceFor = (distance: number): 'high' | 'medium' | 'low' => {
  if (distance <= 10) {
    return 'high'
  }
  if (distance <= 25) {
    return 'medium'
  }
  return 'low'
}

const reverse = (params: URLSearchParams, access: Access): MockResponse => {
  const c = readCoordinate(params)
  if (isError(c)) {
    return c
  }
  const asked = numberParam({ params, name: 'max_distance_m', fallback: REVERSE_DEFAULT_M })
  if (asked === null || asked < 0) {
    return badRequest(`max_distance_m must be a number from 0 to ${REVERSE_MAX_M}`)
  }
  const radius = Math.min(asked, REVERSE_MAX_M)
  const coordinate: [number, number] = [c.lng, c.lat]
  const s = postcodeAt({ lng: c.lng, lat: c.lat })
  const distance = round((Number(s.unit) * 0.37) % 40, 1)
  if (!inNigeria(c.lng, c.lat) || distance > radius) {
    return ok<ReverseResponse>({ found: false, coordinate, message: `no active unit within ${radius}m`, radius_m: radius })
  }

  const f = format(s)
  const unit: NonNullable<ReverseResponse['unit']> = {
    postcode: f.postcode,
    display: f.display,
    distance_m: distance,
    confidence: confidenceFor(distance),
  }
  if (access.maxLevel >= 2) {
    const admin = administrativeAddress(s)
    unit.state_name = admin.state_name
    unit.lga_name = admin.lga_name
    unit.locality_name = admin.locality_name
    unit.address = recentAddress(s)
  }
  return ok<ReverseResponse>({
    found: true,
    coordinate,
    unit,
    area: [s.state, s.lga, s.district, s.area].join('-'),
    district: [s.state, s.lga, s.district].join('-'),
    state: s.state,
    radius_m: radius,
  })
}

const nearby = (params: URLSearchParams): MockResponse => {
  const c = readCoordinate(params)
  if (isError(c)) {
    return c
  }
  const asked = numberParam({ params, name: 'radius', fallback: NEARBY_MAX_M })
  if (asked === null || asked <= 0) {
    return badRequest(`radius must be a number from above 0 to ${NEARBY_MAX_M}`)
  }
  const radius = Math.min(asked, NEARBY_MAX_M)
  const results: NearbyResponse['results'] = []
  if (inNigeria(c.lng, c.lat)) {
    for (let i = 0; i < NEARBY_RESULTS; i++) {
      const f = format(postcodeAt({ lng: c.lng, lat: c.lat, salt: `:${i}` }))
      const distance = round((radius * (i + 0.5)) / NEARBY_RESULTS, 1)
      results.push({ postcode: f.postcode, display: f.display, distance_m: distance })
    }
  }
  return ok<NearbyResponse>({ results, radius_m: radius })
}

// Reference data. Free endpoints: no credits, no level, but the same key handling as the rest.

const KNOWN_STATE_LIST = Object.keys(KNOWN_STATES).sort().join(', ')

/**
 * Reads and normalises one segment parameter (tolerant of case and a missing zero, like Assembly).
 * The state must be one the mock knows, since /v1/reference/states lists only those.
 */
const segmentParams = (opts: { params: URLSearchParams, names: SegmentName[] }): Partial<Segments> | MockResponse => {
  const out: Partial<Segments> = {}
  for (const name of opts.names) {
    const raw = opts.params.get(name)
    if (raw === null || raw.trim() === '') {
      return badRequest(`${name} is required`)
    }
    try {
      out[name] = normaliseSegment(name, raw)
    }
    catch (err) {
      if (err instanceof PostcodeFormatError) {
        return badRequest(err.message)
      }
      throw err
    }
  }
  if (out.state && !KNOWN_STATES[out.state]) {
    return badRequest(`unknown state ${out.state}; the mock knows ${Object.keys(KNOWN_STATES).length} of NIPOST's 37 states: ${KNOWN_STATE_LIST}`)
  }
  return out
}

const statesRoute = (): MockResponse => {
  return ok<StatesResponse>({ states: referenceStates() })
}

const lgasRoute = (params: URLSearchParams): MockResponse => {
  const p = segmentParams({ params, names: ['state'] })
  if (isError(p)) {
    return p
  }
  return ok<LgasResponse>({ lgas: referenceLgas(p.state!) })
}

const districtsRoute = (params: URLSearchParams): MockResponse => {
  const p = segmentParams({ params, names: ['state', 'lga'] })
  if (isError(p)) {
    return p
  }
  return ok<DistrictsResponse>({ districts: referenceDistricts({ state: p.state!, lga: p.lga! }) })
}

const areasRoute = (params: URLSearchParams): MockResponse => {
  const p = segmentParams({ params, names: ['state', 'lga', 'district'] })
  if (isError(p)) {
    return p
  }
  return ok<AreasResponse>({ areas: referenceAreas({ state: p.state!, lga: p.lga!, district: p.district! }) })
}

const NOTICE = {
  name: 'ng-postcode mock of the NIPOST Postcode API',
  notice: 'Unofficial. Not affiliated with NIPOST or the Federal Ministry of Communications, Innovation and Digital Economy. Responses follow the shapes in the public docs and OpenAPI spec; all data beyond the published postcodes and the 11 known state names is mock data.',
  real_api: 'https://api.postcode.gov.ng',
  docs: 'https://docs.postcode.gov.ng',
  source: 'https://github.com/poliha/ng-postcode',
  try: '/v1/lookup?code=LA-11-W06-TC-10&level=3',
  openapi: '/openapi.json',
  reserved_keys: RESERVED_KEYS,
  test_postcodes: TEST_POSTCODES,
  sandbox_key_prefix: SANDBOX_KEY_PREFIX,
  sandbox_postcodes: SANDBOX_POSTCODES,
}

const toUrl = (url: string | URL): URL | null => {
  if (url instanceof URL) {
    return url
  }
  try {
    return new URL(url, 'http://mock.local')
  }
  catch {
    return null
  }
}

/** Answers one request the way the NIPOST gateway would, using mock data. */
export const handleRequest = (req: MockRequest): MockResponse => {
  const url = toUrl(req.url)
  if (!url) {
    return badRequest('malformed URL')
  }
  const method = req.method.toUpperCase()
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/') {
    const accept = headerValue(req.headers, 'Accept') ?? ''
    if (accept.includes('text/html')) {
      return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Mock': 'true' }, body: docsPage() }
    }
    return respond({ status: 200, body: { ...NOTICE, mock: true } })
  }
  if (path === '/openapi.json') {
    return respond({ status: 200, body: mockOpenApi() })
  }
  if (path === '/healthz') {
    return { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Mock': 'true' }, body: 'ok' }
  }

  const access = authorise(headerValue(req.headers, 'X-API-Key'))
  if (isError(access)) {
    return access
  }

  const params = url.searchParams
  switch (`${method} ${path}`) {
    case 'GET /v1/lookup':
      return lookup(params, access)
    case 'POST /v1/assembly/assemble':
      return assembleRoute(req.body)
    case 'GET /v1/assembly/disassemble':
      return disassembleRoute(params)
    case 'GET /v1/search/autocomplete':
      return autocomplete(params, access)
    case 'GET /v1/search/reverse':
      return reverse(params, access)
    case 'GET /v1/search/nearby':
      return nearby(params)
    case 'GET /v1/reference/states':
      return statesRoute()
    case 'GET /v1/reference/lgas':
      return lgasRoute(params)
    case 'GET /v1/reference/districts':
      return districtsRoute(params)
    case 'GET /v1/reference/areas':
      return areasRoute(params)
  }
  if (ROUTES.includes(path)) {
    return fail({ status: 405, code: 'method_not_allowed', message: `${method} is not supported on ${path}` })
  }
  return fail({ status: 404, code: 'not_found', message: `${path} is not part of the mock; see / for what is` })
}
