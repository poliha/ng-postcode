import { startMockServer } from './server'

const port = Number(process.env.PORT ?? 8081)
const host = process.env.HOST ?? '127.0.0.1'

const server = await startMockServer({ port, host })
console.log(`ng-postcode mock listening on http://${host}:${port}`)
console.log(`try: curl "http://${host}:${port}/v1/lookup?code=LA-11-W06-TC-10&level=3"`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
