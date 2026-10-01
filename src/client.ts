// A small typed client for the Postcode API. Point it at the mock or the real gateway; nothing
// else changes.
//
//   const api = createPostcodeClient({ baseUrl: 'http://localhost:8081' })              // mock
//   const api = createPostcodeClient({ apiKey: process.env.NIPOST_API_KEY })            // real

import type { Segments } from './format'
import type {
  AssembleResponse, AutocompleteResponse, DisassembleResponse, LookupLevel, LookupResponse,
  NearbyResponse, ReverseResponse,
} from './types'

export interface ClientOptions {
  /** Defaults to the real gateway, https://api.postcode.gov.ng */
  baseUrl?: string
  /** Sent as `X-API-Key`. Use a secret key server-side only. */
  apiKey?: string
  fetch?: typeof fetch
}

export class PostcodeApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(opts: { status: number, code: string, message: string }) {
    super(opts.message)
    this.name = 'PostcodeApiError'
    this.status = opts.status
    this.code = opts.code
  }
}

interface RequestOptions {
  path: string
  query?: Record<string, string | number | undefined>
  body?: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const errorFrom = (status: number, json: unknown): PostcodeApiError => {
  if (isObject(json) && isObject(json.error)) {
    return new PostcodeApiError({ status, code: String(json.error.code), message: String(json.error.message) })
  }
  return new PostcodeApiError({ status, code: 'http_error', message: `HTTP ${status}` })
}

export const createPostcodeClient = (options: ClientOptions = {}) => {
  const base = (options.baseUrl ?? 'https://api.postcode.gov.ng').replace(/\/+$/, '')
  const doFetch = options.fetch ?? globalThis.fetch

  const request = async <T>(req: RequestOptions): Promise<T> => {
    const url = new URL(`${base}${req.path}`)
    for (const [k, v] of Object.entries(req.query ?? {})) {
      if (v !== undefined) {
        url.searchParams.set(k, String(v))
      }
    }
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.apiKey) {
      headers['X-API-Key'] = options.apiKey
    }
    const init: RequestInit = { method: 'GET', headers }
    if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.method = 'POST'
      init.body = JSON.stringify(req.body)
    }

    const res = await doFetch(url, init)
    const json: unknown = await res.json().catch(() => null)
    if (!res.ok || !isObject(json) || !('data' in json)) {
      throw errorFrom(res.status, json)
    }
    return json.data as T
  }

  return {
    lookup: (code: string, level: LookupLevel = 1) => {
      return request<LookupResponse>({ path: '/v1/lookup', query: { code, level } })
    },
    autocomplete: (q: string) => {
      return request<AutocompleteResponse>({ path: '/v1/search/autocomplete', query: { q } })
    },
    nearby: (opts: { lng: number, lat: number, radius?: number }) => {
      return request<NearbyResponse>({ path: '/v1/search/nearby', query: opts })
    },
    reverse: (opts: { lng: number, lat: number, maxDistanceM?: number }) => {
      return request<ReverseResponse>({
        path: '/v1/search/reverse',
        query: { lng: opts.lng, lat: opts.lat, max_distance_m: opts.maxDistanceM },
      })
    },
    assemble: (segments: Segments) => {
      return request<AssembleResponse>({ path: '/v1/assembly/assemble', body: segments })
    },
    disassemble: (code: string) => {
      return request<DisassembleResponse>({ path: '/v1/assembly/disassemble', query: { code } })
    },
  }
}

export type PostcodeClient = ReturnType<typeof createPostcodeClient>
