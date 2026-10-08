# ng-postcode

Validate and format Nigerian postcodes offline, and mock the
[NIPOST Postcode API](https://docs.postcode.gov.ng) so you can try it without an account, trigger
its error responses on demand, and test an integration without a network.

A walkthrough of the postcode format, the API, NIPOST's test and live keys, and building against
this mock: [Nigeria's Postcode API: How It Works and How to Test It](https://oliha.dev/articles/building-on-nigerias-postcode-api/).

> **Unofficial.** Not affiliated with NIPOST or the Federal Ministry of Communications, Innovation
> and Digital Economy. The mock follows the response shapes in NIPOST's public docs and OpenAPI
> spec. Apart from NIPOST's published postcodes and the names of the states they are in, all of its
> data is made up and labelled `MOCK`.

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

Open https://ng-postcode.oliha.dev in a browser to explore every endpoint and call it from the
page (Swagger UI). The mock's own OpenAPI spec is at
[`/openapi.json`](https://ng-postcode.oliha.dev/openapi.json); a test checks every response
against it.

Or run it locally, on the same port NIPOST's docs use for a local gateway:

```bash
npx ng-postcode-mock          # http://127.0.0.1:8081, set PORT and HOST to change
```

## Why this exists

Every endpoint of the real API, apart from its health check, needs a key. A sandbox key
(`nipost_test_…`) comes without KYB, but it reads a sandbox of public places, not the live
postcode database. A live key, which resolves real postcodes, needs an
organisation account, KYB documents and an access request. Lookup L2 to L5 then cost credits and
need a granted access level, and the error responses are hard to trigger on purpose. This package
lets you write and test that code today.

Where NIPOST's docs and API disagree, checked on 2026-10-06:

| | What NIPOST publishes | Status |
|---|---|---|
| Do Search, Assembly and Lookup L1 need a key? | The quickstart and authentication pages now say every endpoint needs one, matching the OpenAPI spec and the gateway (`401 auth_required` without a key). The quickstart's first cURL example still sends no key header. | Resolved, apart from that example. On 2026-10-01 the docs said these worked without a key. |
| Lookup levels | The Lookup levels page now shows L1 to L5, matching the spec. | Resolved. It showed L1 to L3 on 2026-10-01. |
| Postcode length | The docs index and the postcode format page say 12 characters; NIPOST's landing page and FAQ say 11. The segments add up to 11 (`EK01A03FK01`). | Open |

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
`reverse({ lng, lat, maxDistanceM })`, `assemble(segments)`, `disassemble(code)`, and for reference
data `states()`, `lgas(state)`, `districts({ state, lga })` and `areas({ state, lga, district })`.

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

Any key, or no key, gets full access at every level, unless it is one of the reserved keys below or
a sandbox key. To exercise your error handling, send one of these in `X-API-Key` (on the docs page,
pick it from the dropdown on any endpoint):

| Key | Behaviour |
|---|---|
| `mock_level_1` | Lookups capped at level 1; asking for more returns the fields up to L1 |
| `mock_level_2` | Lookups capped at level 2; asking for more returns the fields up to L2 |
| `mock_level_3` | Lookups capped at level 3; asking for more returns the fields up to L3 |
| `mock_level_4` | Lookups capped at level 4; asking for more returns the fields up to L4 |
| `mock_level_5` | Lookups capped at level 5; asking for more returns the fields up to L5 |
| `mock_no_credits` | `402 insufficient_credits` on Lookup L2+ |
| `mock_no_scope` | `403 level_not_granted` on Lookup L2+ |
| `mock_rate_limited` | `429 rate_limited` on every call, with `Retry-After: 60` |
| `mock_invalid` | `401 invalid_api_key` |
| `mock_no_key` | `401 auth_required`, as the real gateway answers with no key |

It is a fixed list in the code. The mock keeps no state.

### Sandbox keys

NIPOST's sandbox keys start with `nipost_test_`, and the mock treats any key with that prefix the
same way. Under a sandbox key the mock resolves only the five sandbox postcodes NIPOST publishes
(NIPOST's own sandbox holds more; autocomplete with a test key finds them):

```
FC-01-A01-KP-27   FC-01-A01-LR-01   FC-01-A01-MH-01   FC-01-A01-MV-01   FC-01-A01-MW-01
```

Every other code, the 20 sample postcodes included, comes back `valid: false`. Sandbox lookups use
no credits at any level and are never capped, and autocomplete suggests from the sandbox postcodes
only. A live key (`nipost_live_…`) is the mirror image: the five sandbox postcodes come back
`valid: false` under it, since NIPOST says they resolve only under a test key. No key and the
reserved `mock_*` keys behave as described above. NIPOST describes the sandbox postcodes as public
buildings, so their L3 building use reads `public`.
The docs page offers `nipost_test_mock` in its dropdown.

## What is real and what is made up

- **Paths, parameters and response shapes** come from the
  [OpenAPI spec](https://docs.postcode.gov.ng/api-reference/openapi.yaml), vendored in `spec/`
  with its source and fetch date. A contract test checks each endpoint's success response against
  the spec's schema, where the spec has one. The spec marks no fields as required, so the test
  checks the type of each field present.
- **Sample postcodes** are the 20 real ones NIPOST publishes for live keys, plus the quickstart's
  worked example `EK-01-A03-FK-01`. Autocomplete suggests from these.
- **Sandbox postcodes** are the five NIPOST publishes for sandbox keys. NIPOST describes each only
  as a public building in the FCT, so the mock gives them the same mock data as any other code.
- **State names and zones** are real for 11 states: the 20 sample postcodes cover 10 (AK, BA, EB,
  EN, FC, JI, KN, LA, NI and OG) and the quickstart's example adds EK. NIPOST has 37 states. Other
  well-formed state codes return `MOCK STATE XX`.
- **Reference data** (`/v1/reference/*`): `states` lists the 11 states the mock knows, with their
  real names; NIPOST's lists all 37. Each known state has LGAs `01` to `40`, named `MOCK LGA NN` as
  lookups name them (except `EK-01`, ADO EKITI, which NIPOST's docs give). Districts and areas are
  generated codes, the same on every call, and always include the segments of the published
  postcodes. An unknown state is a `400`; an LGA or district the mock does not list gives an empty
  list.
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
  for 400 (`invalid_request` and the others), 429 (`rate_limited`) and an invalid key
  (`invalid_api_key`). NIPOST's 429 docs mention only `X-RateLimit-Limit` and
  `X-RateLimit-Remaining`; the mock's `Retry-After` is its own addition. The codes `auth_required`,
  `insufficient_credits` and `level_not_granted` are documented.
- The mock has not been checked against a real API response; its author has no access yet.
- The widget endpoints (`/v1/widget/*`) are not mocked. NIPOST ships its own widget SDKs.

Found a difference from the real API? Please open an issue with the real response.

## Licence

MIT. NIPOST's OpenAPI spec in `spec/` is theirs, included unmodified for type and contract checks.
