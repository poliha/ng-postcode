import { describe, expect, it } from 'vitest'
import { handleRequest, RESERVED_KEYS } from '../src/mock'

const get = (url: string, key?: string) => {
  const headers: Record<string, string> = {}
  if (key) {
    headers['X-API-Key'] = key
  }
  return handleRequest({ method: 'GET', url, headers })
}

const data = (url: string, key?: string): Record<string, any> => {
  return (get(url, key).body as { data: Record<string, any> }).data
}

describe('lookup', () => {
  it('returns the documented L3 shape for the docs example, with the documented LGA', () => {
    const d = data('/v1/lookup?code=EK-01-A03-FK-01&level=3')
    expect(d.postcode).toBe('EK-01-A03-FK-01')
    expect(d.valid).toBe(true)
    expect(d.administrative_address).toMatchObject({ state_name: 'EKITI', lga_name: 'ADO EKITI', zone: 'SOUTH WEST' })
    expect(d.recent_house_address.recent).toContain('MOCK')
    expect(typeof d.building_use_status).toBe('string')
    expect(d.other_building_info).toBeUndefined()
  })

  it('defaults to level 1: validity only', () => {
    expect(data('/v1/lookup?code=LA-11-W06-TC-10')).toEqual({ postcode: 'LA-11-W06-TC-10', valid: true })
  })

  it('adds fields cumulatively up to L5', () => {
    const counts = [1, 2, 3, 4, 5].map(l => Object.keys(data(`/v1/lookup?code=LA-11-W06-TC-10&level=${l}`)).length)
    expect(counts).toEqual([2, 4, 5, 6, 7])
  })

  it('marks L4 and L5 data as mock, and puts the L5 point inside the postcode\'s state', () => {
    const d = data('/v1/lookup?code=EK-01-A03-FK-01&level=5')
    expect(d.other_building_info.mock).toBe(true)
    expect(d.point_geometry).toMatchObject({ type: 'Point', mock: true })
    const [lng, lat] = d.point_geometry.coordinates
    expect(Math.abs(lng - 5.3)).toBeLessThan(0.3)
    expect(Math.abs(lat - 7.7)).toBeLessThan(0.3)
  })

  it('is deterministic', () => {
    expect(data('/v1/lookup?code=KN-31-F82-WJ-80&level=5')).toEqual(data('/v1/lookup?code=kn31f82wj80&level=5'))
  })

  it('labels unconfirmed states as mock data', () => {
    expect(data('/v1/lookup?code=ZZ-01-A03-FK-01&level=2').administrative_address.state_name).toBe('MOCK STATE ZZ')
  })

  it('answers malformed codes with valid: false', () => {
    expect(data('/v1/lookup?code=NOT-A-CODE')).toEqual({ postcode: 'NOT-A-CODE', valid: false })
  })

  it.each(['6', '0', 'two', '0x2', '2e0', ' 2', ''])('rejects level=%j', (level) => {
    expect(get(`/v1/lookup?code=EK01A03FK01&level=${encodeURIComponent(level)}`).status).toBe(400)
  })

  it('rejects a missing code', () => {
    expect(get('/v1/lookup').status).toBe(400)
  })
})

describe('reserved keys', () => {
  it('lets any other key, or none, through at every level', () => {
    expect(Object.keys(data('/v1/lookup?code=EK01A03FK01&level=5'))).toHaveLength(7)
    expect(Object.keys(data('/v1/lookup?code=EK01A03FK01&level=5', 'nipost_test_anything'))).toHaveLength(7)
  })

  it('caps the level with mock_level_N, as a granted level does', () => {
    expect(Object.keys(data('/v1/lookup?code=EK01A03FK01&level=5', 'mock_level_2'))).toHaveLength(4)
    expect(Object.keys(data('/v1/lookup?code=EK01A03FK01&level=5', 'mock_level_9'))).toHaveLength(7)
  })

  it.each([
    { key: RESERVED_KEYS.invalid, url: '/v1/lookup?code=EK01A03FK01', status: 401, code: 'invalid_api_key' },
    { key: RESERVED_KEYS.noKey, url: '/v1/search/autocomplete?q=EK', status: 401, code: 'auth_required' },
    { key: RESERVED_KEYS.rateLimited, url: '/v1/lookup?code=EK01A03FK01', status: 429, code: 'rate_limited' },
    { key: RESERVED_KEYS.noCredits, url: '/v1/lookup?code=EK01A03FK01&level=2', status: 402, code: 'insufficient_credits' },
    { key: RESERVED_KEYS.noScope, url: '/v1/lookup?code=EK01A03FK01&level=3', status: 403, code: 'insufficient_scope' },
  ])('$key gives the documented error envelope', ({ key, url, status, code }) => {
    const res = get(url, key)
    expect(res.status).toBe(status)
    expect(res.body).toMatchObject({ error: { code }, mock: true })
  })

  it('only charges credits and checks scope on L2+', () => {
    expect(get('/v1/lookup?code=EK01A03FK01&level=1', RESERVED_KEYS.noCredits).status).toBe(200)
    expect(get('/v1/lookup?code=EK01A03FK01&level=1', RESERVED_KEYS.noScope).status).toBe(200)
  })

  it('sends rate-limit headers, and Retry-After when limited', () => {
    expect(get('/v1/lookup?code=EK01A03FK01').headers).toMatchObject({ 'X-RateLimit-Limit': '600', 'X-Mock': 'true' })
    expect(get('/v1/lookup?code=EK01A03FK01', RESERVED_KEYS.rateLimited).headers).toMatchObject({ 'X-RateLimit-Remaining': '0', 'Retry-After': '60' })
  })
})

describe('assembly', () => {
  it('assembles, matching the docs example', () => {
    const res = handleRequest({ method: 'POST', url: '/v1/assembly/assemble', body: { state: 'ek', lga: '1', district: 'a03', area: 'fk', unit: '1' } })
    expect(res.body).toEqual({ data: { postcode: 'EK-01-A03-FK-01', display: 'EK 01 A03 FK 01', compact: 'EK01A03FK01' }, mock: true })
  })

  it('rejects bad segments and missing bodies', () => {
    expect(handleRequest({ method: 'POST', url: '/v1/assembly/assemble', body: { state: 'ek' } }).status).toBe(400)
    expect(handleRequest({ method: 'POST', url: '/v1/assembly/assemble' }).status).toBe(400)
  })

  it('disassembles', () => {
    expect(data('/v1/assembly/disassemble?code=EK01A03FK01')).toEqual({ state: 'EK', lga: '01', district: 'A03', area: 'FK', unit: '01' })
    expect(get('/v1/assembly/disassemble?code=nope').status).toBe(400)
  })
})

describe('autocomplete', () => {
  it('suggests the active segment from the test postcodes', () => {
    const d = data('/v1/search/autocomplete?q=EK01')
    expect(d.segment).toBe('district')
    expect(d.suggestions).toEqual([{ code: 'A03', label: 'EK 01 A03' }])
  })

  it('labels states with their names', () => {
    expect(data('/v1/search/autocomplete?q=L').suggestions).toEqual([{ code: 'LA', label: 'LA (LAGOS)' }])
  })

  it('lists every known state for an empty query', () => {
    const codes = data('/v1/search/autocomplete?q=').suggestions.map((s: { code: string }) => s.code)
    expect(codes).toHaveLength(11)
    expect(codes).toContain('OG')
  })

  it('reads a one-digit LGA typed with separators', () => {
    expect(data('/v1/search/autocomplete?q=EK%201%20A').suggestions).toEqual([{ code: 'A03', label: 'EK 01 A03' }])
  })

  it('returns no suggestions for an unknown prefix, and 400 for input that cannot start a postcode', () => {
    expect(data('/v1/search/autocomplete?q=ZZ').suggestions).toEqual([])
    expect(get('/v1/search/autocomplete?q=EK01A03FK01XYZ').status).toBe(400)
  })
})

describe('reverse and nearby', () => {
  it('reverse-geocodes deterministically and clamps the radius at 250m', () => {
    const url = '/v1/search/reverse?lng=3.3792&lat=6.5244&max_distance_m=900'
    const d = data(url)
    expect(d.radius_m).toBe(250)
    expect(d.found).toBe(true)
    expect(d.coordinate).toEqual([3.3792, 6.5244])
    expect(d.unit.postcode).toMatch(/^[A-Z]{2}-\d{2}-[A-Z0-9]{3}-[A-Z]{2}-\d{2}$/)
    expect(data(url)).toEqual(d)
  })

  it.each([
    { lng: 3.3792, lat: 6.5244, state: 'LA' },
    { lng: 8.52, lat: 12.0, state: 'KN' },
    { lng: 7.49, lat: 9.06, state: 'FC' },
  ])('puts ($lng, $lat) in the nearest known state, $state', ({ lng, lat, state }) => {
    const d = data(`/v1/search/reverse?lng=${lng}&lat=${lat}&max_distance_m=250`)
    expect(d.state).toBe(state)
    expect(d.unit.postcode.slice(0, 2)).toBe(state)
  })

  it('omits names from reverse results below L2', () => {
    expect(data('/v1/search/reverse?lng=3.3792&lat=6.5244&max_distance_m=250', 'mock_level_1').unit.state_name).toBeUndefined()
  })

  it('finds nothing outside Nigeria', () => {
    expect(data('/v1/search/reverse?lng=-0.1276&lat=51.5072')).toMatchObject({ found: false, radius_m: 25 })
    expect(data('/v1/search/nearby?lng=-0.1276&lat=51.5072').results).toEqual([])
  })

  it.each([1, 100, 300])('keeps every nearby result inside a %dm radius', (radius) => {
    const d = data(`/v1/search/nearby?lng=7.4951&lat=9.0579&radius=${radius}`)
    expect(d.results).toHaveLength(5)
    for (const r of d.results) {
      expect(r.distance_m).toBeLessThanOrEqual(radius)
    }
  })

  it('clamps the nearby radius at 300m', () => {
    expect(data('/v1/search/nearby?lng=7.4951&lat=9.0579&radius=1e300').radius_m).toBe(300)
  })

  it.each([
    '/v1/search/reverse?lng=3',
    '/v1/search/reverse?lng=&lat=',
    '/v1/search/reverse?lng=200&lat=6',
    '/v1/search/reverse?lng=3&lat=-91',
    '/v1/search/nearby',
    '/v1/search/nearby?lng=7&lat=9&radius=0',
  ])('rejects %s', (url) => {
    expect(get(url).status).toBe(400)
  })
})

describe('routing', () => {
  it('serves the notice at / and ok at /healthz', () => {
    expect((get('/').body as { notice: string }).notice).toMatch(/Unofficial/)
    expect(get('/healthz').body).toBe('ok')
  })

  it('returns 404 and 405 with the error envelope', () => {
    expect(get('/v2/anything').status).toBe(404)
    expect(handleRequest({ method: 'DELETE', url: '/v1/lookup' }).status).toBe(405)
  })

  it('answers a malformed URL with 400 instead of throwing', () => {
    expect(get('http://a:99999/').status).toBe(400)
  })
})
