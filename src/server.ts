// Serves the mock over HTTP with node:http, no framework. Used by the `ng-postcode-mock` command
// and by the hosted mock.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { handleRequest } from './mock'

export interface MockServerOptions {
  /** Defaults to 8081, the port NIPOST's docs use for a local gateway, so switching is a URL change. */
  port?: number
  host?: string
}

const MAX_BODY_BYTES = 16 * 1024

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Expose-Headers': 'X-Mock, X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After',
  'Access-Control-Max-Age': '86400',
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'X-Mock': 'true' }

class BodyTooLargeError extends Error {}

const send = (res: ServerResponse, out: { status: number, headers: Record<string, string>, body: unknown }): void => {
  let payload: string
  if (typeof out.body === 'string') {
    payload = out.body
  }
  else {
    payload = JSON.stringify(out.body)
  }
  res.writeHead(out.status, { ...CORS_HEADERS, ...out.headers })
  res.end(payload)
}

const sendError = (res: ServerResponse, opts: { status: number, code: string, message: string, close?: boolean }): void => {
  const headers: Record<string, string> = { ...JSON_HEADERS }
  if (opts.close) {
    headers.Connection = 'close'
  }
  send(res, { status: opts.status, headers, body: { error: { code: opts.code, message: opts.message }, mock: true } })
}

/**
 * Reads the body up to MAX_BODY_BYTES. Past that it stops buffering but keeps draining, so the
 * socket stays open long enough for the 413 to reach the client.
 */
const readBody = (req: IncomingMessage): Promise<string> => {
  return new Promise((resolve, reject) => {
    let size = 0
    let tooLarge = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) {
        reject(new BodyTooLargeError())
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

const readJsonBody = async (req: IncomingMessage, res: ServerResponse): Promise<{ body: unknown } | null> => {
  const declared = Number(req.headers['content-length'])
  if (declared > MAX_BODY_BYTES) {
    sendError(res, { status: 413, code: 'payload_too_large', message: 'request body is too large', close: true })
    req.resume()
    return null
  }
  let raw: string
  try {
    raw = await readBody(req)
  }
  catch (err) {
    if (err instanceof BodyTooLargeError) {
      sendError(res, { status: 413, code: 'payload_too_large', message: 'request body is too large', close: true })
      return null
    }
    throw err
  }
  if (!raw) {
    return { body: undefined }
  }
  try {
    return { body: JSON.parse(raw) }
  }
  catch {
    sendError(res, { status: 400, code: 'invalid_json', message: 'request body is not valid JSON' })
    return null
  }
}

const onRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const method = req.method ?? 'GET'
  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  let body: unknown
  if (method === 'POST') {
    const parsed = await readJsonBody(req, res)
    if (!parsed) {
      return
    }
    body = parsed.body
  }

  const headers: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) {
      headers[k] = v[0]
    }
    else {
      headers[k] = v
    }
  }

  send(res, handleRequest({ method, url: req.url ?? '/', headers, body }))
}

/** Starts the mock server. Resolves once it is listening. */
export const startMockServer = (options: MockServerOptions = {}): Promise<Server> => {
  const port = options.port ?? 8081
  const host = options.host ?? '127.0.0.1'
  const server = createServer((req, res) => {
    onRequest(req, res).catch((err: unknown) => {
      console.error(err)
      if (!res.headersSent) {
        sendError(res, { status: 500, code: 'internal', message: 'mock server error' })
      }
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      // Swap the startup rejection for a logger, so a later runtime error cannot crash the process.
      server.off('error', reject)
      server.on('error', err => console.error(err))
      resolve(server)
    })
  })
}
