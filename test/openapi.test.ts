// The mock's own spec (served at /openapi.json and shown at /) must describe what the mock does.
// Every sample response here, errors included, is validated against the schema the spec gives for
// that path and status, so the docs page cannot drift from the mock.

import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { handleRequest, RESERVED_KEYS } from '../src/mock'

const jsonOf = (url: string) => handleRequest({ method: 'GET', url }).body as Record<string, any>
const spec = jsonOf('/openapi.json')

const ajv = new Ajv2020({ strict: false })
ajv.addSchema({ $id: 'mock-spec', components: spec.components })

const schemaFor = (opts: { path: string, method: string, status: number }): object => {
  const response = spec.paths[opts.path]?.[opts.method]?.responses?.[opts.status]
  expect(response, `${opts.method} ${opts.path} ${opts.status} is documented`).toBeDefined()
  const schema = response.content['application/json'].schema
  return JSON.parse(JSON.stringify(schema).replaceAll('"#/components/', '"mock-spec#/components/'))
}

const SAMPLES: { method: string, url: string, key?: string, body?: unknown }[] = [
  { method: 'GET', url: '/v1/lookup?code=LA-11-W06-TC-10&level=5' },
  { method: 'GET', url: '/v1/lookup?code=LA-11-W06-TC-10&level=1' },
  { method: 'GET', url: '/v1/lookup?code=nope' },
  { method: 'GET', url: '/v1/lookup' },
  { method: 'GET', url: '/v1/search/autocomplete' },
  { method: 'GET', url: '/v1/assembly/disassemble' },
  { method: 'POST', url: '/v1/assembly/assemble' },
  { method: 'GET', url: '/v1/lookup?code=EK01A03FK01&level=9' },
  { method: 'GET', url: '/v1/lookup?code=EK01A03FK01&level=2', key: RESERVED_KEYS.noCredits },
  { method: 'GET', url: '/v1/lookup?code=EK01A03FK01&level=2', key: RESERVED_KEYS.noScope },
  { method: 'GET', url: '/v1/lookup?code=EK01A03FK01', key: RESERVED_KEYS.invalid },
  { method: 'GET', url: '/v1/lookup?code=EK01A03FK01', key: RESERVED_KEYS.rateLimited },
  { method: 'GET', url: '/v1/search/autocomplete?q=EK%2001' },
  { method: 'GET', url: '/v1/search/autocomplete?q=EK01A03FK01XYZ' },
  { method: 'GET', url: '/v1/search/autocomplete?q=EK', key: RESERVED_KEYS.noKey },
  { method: 'GET', url: '/v1/search/reverse?lng=3.3792&lat=6.5244&max_distance_m=250' },
  { method: 'GET', url: '/v1/search/reverse?lng=-0.12&lat=51.5' },
  { method: 'GET', url: '/v1/search/reverse?lng=200&lat=6' },
  { method: 'GET', url: '/v1/search/nearby?lng=7.4951&lat=9.0579' },
  { method: 'GET', url: '/v1/search/nearby?lng=7&lat=9&radius=0' },
  { method: 'POST', url: '/v1/assembly/assemble', body: { state: 'ek', lga: '1', district: 'a03', area: 'fk', unit: '1' } },
  { method: 'POST', url: '/v1/assembly/assemble', body: { state: 'ek' } },
  { method: 'GET', url: '/v1/assembly/disassemble?code=EK01A03FK01' },
  { method: 'GET', url: '/v1/assembly/disassemble?code=nope' },
]

describe('the mock matches its own spec', () => {
  it.each(SAMPLES)('$method $url ($key)', ({ method, url, key, body }) => {
    const headers: Record<string, string> = {}
    if (key) {
      headers['X-API-Key'] = key
    }
    const res = handleRequest({ method, url, headers, body })
    const path = new URL(url, 'http://x').pathname
    const validate = ajv.compile(schemaFor({ path, method: method.toLowerCase(), status: res.status }))
    const valid = validate(res.body)
    expect(validate.errors ?? []).toEqual([])
    expect(valid).toBe(true)
  })

  it('documents every route the mock serves, and only those', () => {
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/v1/assembly/assemble', '/v1/assembly/disassemble', '/v1/lookup',
      '/v1/search/autocomplete', '/v1/search/nearby', '/v1/search/reverse',
    ])
  })

  it('offers the key dropdown on every operation, listing every reserved key', () => {
    const keys = spec.components.parameters.ApiKey.schema.enum
    expect(keys).toEqual([
      'mock_level_1', 'mock_level_2', 'mock_level_3', 'mock_level_4', 'mock_level_5',
      RESERVED_KEYS.noCredits, RESERVED_KEYS.noScope, RESERVED_KEYS.rateLimited, RESERVED_KEYS.invalid, RESERVED_KEYS.noKey,
    ])
    for (const [path, operations] of Object.entries<Record<string, { parameters?: { $ref?: string }[] }>>(spec.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const refs = (operation.parameters ?? []).map(p => p.$ref)
        expect(refs, `${method} ${path}`).toContain('#/components/parameters/ApiKey')
      }
    }
  })

  it('lists only keys the mock acts on', () => {
    const lookup = (key?: string) => {
      const headers: Record<string, string> = {}
      if (key) {
        headers['X-API-Key'] = key
      }
      return JSON.stringify(handleRequest({ method: 'GET', url: '/v1/lookup?code=EK01A03FK01&level=5', headers }).body)
    }
    const open = lookup()
    for (const key of spec.components.parameters.ApiKey.schema.enum.filter((k: string) => k !== 'mock_level_5')) {
      expect(lookup(key), key).not.toEqual(open)
    }
  })

  it('names itself unofficial and points requests at the mock', () => {
    expect(spec.info.title).toMatch(/unofficial/i)
    expect(spec.servers).toEqual([{ url: '/', description: 'This mock' }])
  })
})

describe('the root page', () => {
  it('gives a browser Swagger UI, pinned with integrity hashes', () => {
    const res = handleRequest({ method: 'GET', url: '/', headers: { Accept: 'text/html,application/xhtml+xml' } })
    expect(res.headers['Content-Type']).toMatch(/text\/html/)
    expect(res.body).toContain('swagger-ui-dist@')
    expect(res.body).toContain('integrity="sha384-')
    expect(res.body).toContain('/openapi.json')
  })

  it('still gives an API client the JSON notice', () => {
    const res = handleRequest({ method: 'GET', url: '/', headers: { Accept: 'application/json' } })
    expect((res.body as { openapi: string }).openapi).toBe('/openapi.json')
  })
})
