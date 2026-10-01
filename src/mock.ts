// The mock itself: one pure function from request to response. The hosted server and the MSW
// handlers are thin adapters over handleRequest, so they always behave identically.
//
// Unofficial. Not affiliated with NIPOST or the Federal Ministry of Communications, Innovation
// and Digital Economy.

import { disassemble, format, parse, parsePartial, PostcodeFormatError, SEGMENT_ORDER, type Segments } from './format'
import { NIGERIA_BBOX, TEST_POSTCODES } from './data'
import {
  administrativeAddress, buildingUse, otherBuildingInfo, pointGeometry, postcodeAt, recentAddress,
  round, stateName,
} from './synth'
import type {
  AssembleResponse, AutocompleteResponse, DisassembleResponse, LookupLevel, LookupResponse,
  NearbyResponse, ReverseResponse,
} from './types'

export { TEST_POSTCODES } from './data'

/**
 * Reserved API keys. Send one in `X-API-Key` to make the mock behave as the real gateway would in
 * that situation. Any other key, or no key at all, gets full access at every level, so nobody
 * needs an account to try the API. This is a static list; the mock keeps no state.
 */
export const RESERVED_KEYS = {
  /** 401: the key is not recognised. */
  invalid: 'mock_invalid',
  /** 401: behave as the real gateway does today when no key is sent. */
  noKey: 'mock_no_key',
  /** 402 on credit-consuming calls (Lookup L2+). */
  noCredits: 'mock_no_credits',
  /** 403 on Lookup L2+: the key lacks the lookup scope. */
  noScope: 'mock_no_scope',
  /** 429 on every call. */
  rateLimited: 'mock_rate_limited',
  /** `mock_level_1` … `mock_level_5`: caps lookups at that level, as an organisation's granted level does. */
  levelPrefix: 'mock_level_',
} as const

export const RATE_LIMIT = 600

/** The spec clamps reverse search at 250m. Nearby has no published ceiling; the widget variant's 300m is used. */
const REVERSE_MAX_M = 250
const REVERSE_DEFAULT_M = 25
const NEARBY_MAX_M = 300
const NEARBY_RESULTS = 5
const AUTOCOMPLETE_LIMIT = 20

const ROUTES = [
  '/v1/lookup', '/v1/assembly/assemble', '/v1/assembly/disassemble',
  '/v1/search/autocomplete', '/v1/search/reverse', '/v1/search/nearby',
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
}

/** Applies the reserved-key behaviours. Returns an error response, or the access the key grants. */
const authorise = (key: string | undefined): MockResponse | Access => {
  const access: Access = { maxLevel: 5, noCredits: false, noScope: false }
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
    return fail({ status: 403, code: 'insufficient_scope', message: 'this key lacks the lookup scope (mock: reserved key mock_no_scope)' })
  }
  if (requested >= 2 && access.noCredits) {
    return fail({ status: 402, code: 'insufficient_credits', message: 'not enough credits; top up to continue' })
  }
  const level = Math.min(requested, access.maxLevel)

  const parsed = parse(code)
  if (!parsed) {
    return ok<LookupResponse>({ postcode: code, valid: false })
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

const autocomplete = (params: URLSearchParams): MockResponse => {
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
  const labels = new Map<string, string>()
  for (const s of TEST_SEGMENTS) {
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

const NOTICE = {
  name: 'ng-postcode mock of the NIPOST Postcode API',
  notice: 'Unofficial. Not affiliated with NIPOST or the Federal Ministry of Communications, Innovation and Digital Economy. Responses follow the shapes in the public docs and OpenAPI spec; all data beyond the published test postcodes is mock data.',
  real_api: 'https://api.postcode.gov.ng',
  docs: 'https://docs.postcode.gov.ng',
  source: 'https://github.com/poliha/ng-postcode',
  try: '/v1/lookup?code=LA-11-W06-TC-10&level=3',
  reserved_keys: RESERVED_KEYS,
  test_postcodes: TEST_POSTCODES,
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
    return respond({ status: 200, body: { ...NOTICE, mock: true } })
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
      return autocomplete(params)
    case 'GET /v1/search/reverse':
      return reverse(params, access)
    case 'GET /v1/search/nearby':
      return nearby(params)
  }
  if (ROUTES.includes(path)) {
    return fail({ status: 405, code: 'method_not_allowed', message: `${method} is not supported on ${path}` })
  }
  return fail({ status: 404, code: 'not_found', message: `${path} is not part of the mock; see / for what is` })
}
