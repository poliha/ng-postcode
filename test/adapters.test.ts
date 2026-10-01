// The HTTP server and the MSW handlers, both driven through the client, so the path a real user
// takes (client → network → mock) is covered end to end.

import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPostcodeClient, PostcodeApiError } from '../src/index'
import { postcodeHandlers } from '../src/msw'
import { startMockServer } from '../src/server'

const EK_SEGMENTS = { state: 'ek', lga: '1', district: 'a03', area: 'fk', unit: '1' }

describe('HTTP server', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    server = await startMockServer({ port: 0 })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  it('answers the client at every endpoint', async () => {
    const api = createPostcodeClient({ baseUrl: base })
    const lookup = await api.lookup('LA-11-W06-TC-10', 3)
    const assembled = await api.assemble(EK_SEGMENTS)
    const segments = await api.disassemble('EK01A03FK01')
    const suggestions = await api.autocomplete('EK01')
    const reversed = await api.reverse({ lng: 3.3792, lat: 6.5244, maxDistanceM: 250 })
    const nearby = await api.nearby({ lng: 3.3792, lat: 6.5244 })

    expect(lookup.administrative_address?.state_name).toBe('LAGOS')
    expect(assembled.postcode).toBe('EK-01-A03-FK-01')
    expect(segments.district).toBe('A03')
    expect(suggestions.segment).toBe('district')
    expect(reversed.radius_m).toBe(250)
    expect(nearby.radius_m).toBe(300)
  })

  it('surfaces gateway errors as PostcodeApiError', async () => {
    const api = createPostcodeClient({ baseUrl: base, apiKey: 'mock_no_credits' })
    const failure = api.lookup('EK01A03FK01', 2)
    await expect(failure).rejects.toBeInstanceOf(PostcodeApiError)
    await expect(failure).rejects.toMatchObject({ status: 402, code: 'insufficient_credits' })
  })

  it('sends CORS headers and answers preflight', async () => {
    const preflight = await fetch(`${base}/v1/lookup`, { method: 'OPTIONS' })
    const res = await fetch(`${base}/v1/lookup?code=EK01A03FK01`)
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toContain('X-API-Key')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('x-mock')).toBe('true')
  })

  it('rejects malformed JSON with 400', async () => {
    const res = await fetch(`${base}/v1/assembly/assemble`, { method: 'POST', body: '{nope', headers: { 'Content-Type': 'application/json' } })
    expect(res.status).toBe(400)
  })

  it('answers an oversized body with 413, declared or streamed', async () => {
    const declared = await fetch(`${base}/v1/assembly/assemble`, { method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(40_000) }) })
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(40_000)))
        controller.close()
      },
    })
    const streamed = await fetch(`${base}/v1/assembly/assemble`, { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    expect(declared.status).toBe(413)
    expect(streamed.status).toBe(413)
  })
})

describe('MSW handlers', () => {
  const msw = setupServer(...postcodeHandlers(), ...postcodeHandlers({ baseUrl: 'http://gateway.test/api' }))
  beforeAll(() => msw.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => msw.close())

  it('intercepts calls to the real gateway URL', async () => {
    const api = createPostcodeClient({ apiKey: 'nipost_test_whatever' })
    const lookup = await api.lookup('KN-31-F82-WJ-80')
    const assembled = await api.assemble(EK_SEGMENTS)
    expect(lookup).toEqual({ postcode: 'KN-31-F82-WJ-80', valid: true })
    expect(assembled.compact).toBe('EK01A03FK01')
  })

  it('handles a base URL with a path prefix', async () => {
    const api = createPostcodeClient({ baseUrl: 'http://gateway.test/api' })
    const lookup = await api.lookup('KN-31-F82-WJ-80')
    expect(lookup.valid).toBe(true)
  })

  it('applies reserved keys', async () => {
    const api = createPostcodeClient({ apiKey: 'mock_rate_limited' })
    await expect(api.lookup('KN-31-F82-WJ-80')).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
  })
})

describe('client', () => {
  it('turns a non-object 2xx body into PostcodeApiError', async () => {
    const fakeFetch = (async () => new Response('true', { status: 200 })) as typeof fetch
    const api = createPostcodeClient({ fetch: fakeFetch })
    await expect(api.lookup('EK01A03FK01')).rejects.toMatchObject({ status: 200, code: 'http_error' })
  })
})
