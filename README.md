# ng-postcode

Validate and format Nigerian postcodes offline, and mock the
[NIPOST Postcode API](https://docs.postcode.gov.ng) so you can build and test an integration
before your organisation account, KYB and API keys come through.

> **Unofficial.** Not affiliated with NIPOST or the Federal Ministry of Communications, Innovation
> and Digital Economy. The mock follows the response shapes in NIPOST's public docs and OpenAPI
> spec. Apart from the published test postcodes, all of its data is made up and labelled `MOCK`.

## Try the mock

No sign-up, no key:

```bash
curl "https://ng-postcode.oliha.dev/v1/lookup?code=LA-11-W06-TC-10&level=3"
```

```json
{
  "data": {
    "postcode": "LA-11-W06-TC-10",
    "valid": true,
    "administrative_address": { "state_name": "LAGOS", "lga_name": "MOCK LGA 11", "locality_name": "MOCK LGA 11", "zone": "SOUTH WEST" },
    "recent_house_address": { "recent": "10 MOCK STREET, AREA TC, LAGOS" },
    "building_use_status": "commercial"
  },
  "mock": true
}
```

Every body the mock sends carries `"mock": true` beside `data` or `error`, and every response has an
`X-Mock: true` header. The real API sends neither.

Or run it locally, on the same port NIPOST's docs use for a local gateway:

```bash
npx ng-postcode-mock          # http://127.0.0.1:8081, set PORT and HOST to change
```

## Why this exists

The real API needs an organisation account, KYB documents and an access request before it answers
anything. The docs say Search, Assembly and Lookup L1 work without a key, but on 2026-10-01 the
gateway returned `401 auth_required` for all of them, and the OpenAPI spec agrees with the gateway.
Even once that is sorted, Lookup L2 to L5 cost credits and need a granted access level, and the error
responses are hard to trigger on purpose. This package lets you write and test that code today.

| | Prose docs | OpenAPI spec | Live gateway (2026-10-01) |
|---|---|---|---|
| Search, Assembly, Lookup L1 need a key? | No | Yes | Yes (`401 auth_required`) |
| Lookup levels | L1 to L3 | L1 to L5 | not testable without a key |
| Postcode length | "12 characters" | n/a | segments add up to 11 (`EK01A03FK01`) |

## Install

```bash
npm install ng-postcode
```

No runtime dependencies. `msw` is an optional peer, needed only for `ng-postcode/msw`. ESM and
CommonJS both work, on Node 18 or later.

## Validate and format, offline

```ts
import { assemble, disassemble, format, isValidFormat, parse } from 'ng-postcode'

format('ek01a03fk01')
// { postcode: 'EK-01-A03-FK-01', display: 'EK 01 A03 FK 01', compact: 'EK01A03FK01' }

assemble({ state: 'ek', lga: 1, district: 'a03', area: 'fk', unit: 1 }).postcode  // 'EK-01-A03-FK-01'
disassemble('EK 01 A03 FK 01')  // { state: 'EK', lga: '01', district: 'A03', area: 'FK', unit: '01' }
isValidFormat('EK-00-A03-FK-01')  // false: numeric segments run 01 to 99
parse('not a postcode')           // null
```

These follow the published format rules (`AA-99-H77-BB-55`; tolerant of spaces, hyphens and case;
numeric segments zero-filled). A well-formed postcode is not necessarily one that exists; only the
API can tell you that.

## Call the API

```ts
import { createPostcodeClient } from 'ng-postcode'

const api = createPostcodeClient({ baseUrl: 'http://127.0.0.1:8081' })        // the mock
// const api = createPostcodeClient({ apiKey: process.env.NIPOST_API_KEY })   // the real gateway

const result = await api.lookup('LA-11-W06-TC-10', 3)
```

Switching to the real API means removing `baseUrl` and adding your key. Errors throw
`PostcodeApiError` with the gateway's `status` and `code`. Keep secret keys on the server.

Methods: `lookup(code, level)`, `autocomplete(q)`, `nearby({ lng, lat, radius })`,
`reverse({ lng, lat, maxDistanceM })`, `assemble(segments)`, `disassemble(code)`.

## Mock the API in your tests

```ts
import { setupServer } from 'msw/node'
import { postcodeHandlers } from 'ng-postcode/msw'

const server = setupServer(...postcodeHandlers())   // intercepts https://api.postcode.gov.ng
beforeAll(() => server.listen())
afterAll(() => server.close())
```

Your production code keeps calling the real URL; the handlers answer instead. Pass
`postcodeHandlers({ baseUrl })` to intercept a different host. Without MSW, call
`handleRequest()` from `ng-postcode/mock` directly.

## Reserved keys

Any key, or no key, gets full access at every level. To exercise your error handling, send one of
these in `X-API-Key`:

| Key | Behaviour |
|---|---|
| `mock_level_1` to `mock_level_5` | Lookups are capped at that level, as an organisation's granted level caps them |
| `mock_no_credits` | `402 insufficient_credits` on Lookup L2+ |
| `mock_no_scope` | `403 insufficient_scope` on Lookup L2+ |
| `mock_rate_limited` | `429 rate_limited` on every call, with `Retry-After: 60` |
| `mock_invalid` | `401 invalid_api_key` |
| `mock_no_key` | `401 auth_required`, as the real gateway answers today with no key |

It is a fixed list in the code. The mock keeps no state.

## What is real and what is made up

- **Paths, parameters and response shapes** come from the
  [OpenAPI spec](https://docs.postcode.gov.ng/api-reference/openapi.yaml), vendored in `spec/`
  with its source and fetch date. A contract test checks each endpoint's success response against
  the spec's schema, where the spec has one. The spec marks no fields as required, so the test
  checks the type of each field present.
- **Test postcodes** are the 20 real ones NIPOST publishes, plus the docs' worked example
  `EK-01-A03-FK-01`. Autocomplete suggests from these.
- **State names and zones** are real for the 11 states that appear in those postcodes. Other
  well-formed state codes return `MOCK STATE XX`.
- **LGA names, addresses and building use** are mock data, deterministic per postcode. Building use
  is a random pick of `residential`, `commercial` or `mixed`; it says nothing about the real
  building.
- **L5 coordinates** are a random point near the centre of the postcode's state, marked
  `"mock": true` inside the GeoJSON. They are not the building's location.
- **Reverse and nearby search** return random well-formed postcodes. The state is the nearest of
  the 11 known states to the coordinate; everything below the state is random. `nearby` clamps its
  radius at 300m, the ceiling NIPOST documents for the widget's nearby search.
- **Guessed shapes**, because NIPOST has not published them: the inner fields of L4
  `other_building_info`, L5 `point_geometry` (a GeoJSON Point here), the whole `/v1/search/nearby`
  response (`results` follows the one published hint, from the widget docs), and the error codes
  for 400, 403, 429 and an invalid key. The codes `auth_required` and
  `insufficient_credits` are documented.
- The mock has not been checked against a real API response; its author has no access yet.
- The widget endpoints (`/v1/widget/*`) are not mocked. NIPOST ships its own widget SDKs.

Found a difference from the real API? Please open an issue with the real response.

## Licence

MIT. NIPOST's OpenAPI spec in `spec/` is theirs, included unmodified for type and contract checks.
