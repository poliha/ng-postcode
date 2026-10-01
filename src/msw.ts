// MSW request handlers that answer calls to the NIPOST API with the mock, so a test suite can
// exercise real fetch code with no network and no key.
//
//   import { setupServer } from 'msw/node'
//   import { postcodeHandlers } from 'ng-postcode/msw'
//   const server = setupServer(...postcodeHandlers())

import { http, HttpResponse } from 'msw'
import { handleRequest } from './mock'

export const REAL_BASE_URL = 'https://api.postcode.gov.ng'

export interface HandlerOptions {
  /** Base URL to intercept, with or without a path prefix. Defaults to the real gateway. */
  baseUrl?: string
}

const readJson = async (request: Request): Promise<{ body: unknown } | null> => {
  const text = await request.text()
  if (!text) {
    return { body: undefined }
  }
  try {
    return { body: JSON.parse(text) }
  }
  catch {
    return null
  }
}

export const postcodeHandlers = (options: HandlerOptions = {}) => {
  const base = (options.baseUrl ?? REAL_BASE_URL).replace(/\/+$/, '')
  const prefix = new URL(base).pathname.replace(/\/+$/, '')

  return [
    http.all(`${base}/*`, async ({ request }) => {
      let body: unknown
      if (request.method === 'POST') {
        const parsed = await readJson(request)
        if (!parsed) {
          return HttpResponse.json({ error: { code: 'invalid_json', message: 'request body is not valid JSON' }, mock: true }, { status: 400 })
        }
        body = parsed.body
      }

      const url = new URL(request.url)
      url.pathname = url.pathname.slice(prefix.length) || '/'
      const out = handleRequest({ method: request.method, url, headers: request.headers, body })
      if (typeof out.body === 'string') {
        return new HttpResponse(out.body, { status: out.status, headers: out.headers })
      }
      return HttpResponse.json(out.body as Record<string, unknown>, { status: out.status, headers: out.headers })
    }),
  ]
}
