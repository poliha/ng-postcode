// Refreshes the vendored copy of NIPOST's OpenAPI spec and records where and when it came from.
// Run: node scripts/refresh-spec.mjs, then review the diff in spec/openapi.yaml.
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const SOURCE = 'https://docs.postcode.gov.ng/api-reference/openapi.yaml'

const res = await fetch(SOURCE)
if (!res.ok) {
  throw new Error(`GET ${SOURCE} returned ${res.status}`)
}
const text = await res.text()
const sha256 = createHash('sha256').update(text).digest('hex')
const fetchedAt = new Date().toISOString().slice(0, 10)

await writeFile(new URL('../spec/openapi.yaml', import.meta.url), text)
await writeFile(
  new URL('../spec/SOURCE.json', import.meta.url),
  JSON.stringify({ source: SOURCE, fetchedAt, sha256, note: 'Unmodified copy of NIPOST\'s published spec. It carries no licence field; it is vendored for type and contract checks only.' }, null, 2) + '\n',
)
console.log(`spec/openapi.yaml refreshed from ${SOURCE} (${fetchedAt}, sha256 ${sha256.slice(0, 12)})`)
