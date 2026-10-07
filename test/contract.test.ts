// Checks mock success responses against the schemas in NIPOST's own OpenAPI spec (vendored in
// spec/). The spec's schemas declare no `required` fields, so this checks the type of every field
// present, not that every field is present. If NIPOST changes a shape and spec/ is refreshed, this
// is the test that should fail.

import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { handleRequest } from '../src/mock'
import { SANDBOX_POSTCODES, TEST_POSTCODES } from '../src/data'

const spec = parseYaml(readFileSync(new URL('../spec/openapi.yaml', import.meta.url), 'utf8'))
const ajv = new Ajv2020({ strict: false })
ajv.addSchema({ $id: 'spec', components: spec.components })

const responseSchema = (operation: { path: string, method: string }): object => {
  const schema = spec.paths[operation.path][operation.method].responses['200'].content['application/json'].schema
  return JSON.parse(JSON.stringify(schema).replaceAll('"#/components/', '"spec#/components/'))
}

const check = (operation: { path: string, method: string, url: string, body?: unknown, key?: string }) => {
  const headers: Record<string, string> = {}
  if (operation.key) {
    headers['X-API-Key'] = operation.key
  }
  const res = handleRequest({ method: operation.method.toUpperCase(), url: operation.url, body: operation.body, headers })
  const validate = ajv.compile(responseSchema(operation))
  const valid = validate(res.body)
  expect(res.status, operation.url).toBe(200)
  expect(validate.errors ?? [], operation.url).toEqual([])
  expect(valid).toBe(true)
}

describe('mock success responses match the published spec', () => {
  it('GET /v1/lookup, every test postcode at every level', () => {
    for (const code of TEST_POSTCODES) {
      for (const level of [1, 2, 3, 4, 5]) {
        check({ path: '/v1/lookup', method: 'get', url: `/v1/lookup?code=${code}&level=${level}` })
      }
    }
  })

  it('GET /v1/lookup, every sandbox postcode at every level under a sandbox key, and a sample one refused', () => {
    for (const code of [...SANDBOX_POSTCODES, TEST_POSTCODES[0]!]) {
      for (const level of [1, 2, 3, 4, 5]) {
        check({ path: '/v1/lookup', method: 'get', url: `/v1/lookup?code=${code}&level=${level}`, key: 'nipost_test_contract' })
      }
    }
  })

  it('GET /v1/reference/states', () => {
    check({ path: '/v1/reference/states', method: 'get', url: '/v1/reference/states' })
  })

  it('GET /v1/reference/lgas, districts and areas, listed and empty', () => {
    for (const url of ['/v1/reference/lgas?state=FC', '/v1/reference/lgas?state=EK']) {
      check({ path: '/v1/reference/lgas', method: 'get', url })
    }
    for (const url of ['/v1/reference/districts?state=FC&lga=01', '/v1/reference/districts?state=FC&lga=99']) {
      check({ path: '/v1/reference/districts', method: 'get', url })
    }
    for (const url of ['/v1/reference/areas?state=FC&lga=01&district=A01', '/v1/reference/areas?state=FC&lga=01&district=Z00']) {
      check({ path: '/v1/reference/areas', method: 'get', url })
    }
  })

  it('POST /v1/assembly/assemble', () => {
    const body = { state: 'ek', lga: '1', district: 'a03', area: 'fk', unit: '1' }
    check({ path: '/v1/assembly/assemble', method: 'post', url: '/v1/assembly/assemble', body })
  })

  it('GET /v1/assembly/disassemble', () => {
    check({ path: '/v1/assembly/disassemble', method: 'get', url: '/v1/assembly/disassemble?code=EK01A03FK01' })
  })

  it('GET /v1/search/autocomplete', () => {
    for (const q of ['', 'L', 'EK', 'EK01', 'EK01A03', 'EK01A03FK']) {
      check({ path: '/v1/search/autocomplete', method: 'get', url: `/v1/search/autocomplete?q=${q}` })
    }
  })

  it('GET /v1/search/reverse, found and not found', () => {
    check({ path: '/v1/search/reverse', method: 'get', url: '/v1/search/reverse?lng=3.3792&lat=6.5244&max_distance_m=250' })
    check({ path: '/v1/search/reverse', method: 'get', url: '/v1/search/reverse?lng=-0.12&lat=51.5' })
  })

  it('the spec still has the paths the mock serves', () => {
    for (const path of [
      '/healthz', '/v1/lookup', '/v1/assembly/assemble', '/v1/assembly/disassemble', '/v1/search/autocomplete',
      '/v1/search/nearby', '/v1/search/reverse',
      '/v1/reference/states', '/v1/reference/lgas', '/v1/reference/districts', '/v1/reference/areas',
    ]) {
      expect(spec.paths[path], path).toBeDefined()
    }
  })
})
