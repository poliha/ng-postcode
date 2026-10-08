// OpenAPI description of the mock itself, served at /openapi.json and rendered at / for browsers.
// Written for this package (MIT); it follows the paths, parameters and field names of NIPOST's
// published spec so code written against one works against the other, and it documents what only
// the mock does: reserved keys, sandbox keys, the `mock` marker and the guessed nearby shape.

import { version } from '../package.json'
import { KNOWN_STATES, SANDBOX_POSTCODES } from './data'
import { KEY_BEHAVIOUR, RATE_LIMIT, RESERVED_KEYS, SANDBOX_KEY_PREFIX } from './keys'

const POSTCODE_EXAMPLE = 'LA-11-W06-TC-10'

const envelope = (data: object) => {
  return {
    type: 'object',
    required: ['data', 'mock'],
    properties: {
      data,
      mock: { type: 'boolean', const: true, description: 'Marks a mock response. The real API does not send it.' },
    },
  }
}

const json = (schema: object, description: string) => {
  return { description, content: { 'application/json': { schema } } }
}

const errorResponse = (description: string) => {
  return json({ $ref: '#/components/schemas/Error' }, description)
}

const RATE_HEADERS = {
  'X-RateLimit-Limit': { schema: { type: 'integer', example: RATE_LIMIT } },
  'X-RateLimit-Remaining': { schema: { type: 'integer' } },
  'X-Mock': { schema: { type: 'string', const: 'true' } },
}

const okResponse = (data: object, description: string) => {
  return { ...json(envelope(data), description), headers: RATE_HEADERS }
}

const API_KEY_PARAM = { $ref: '#/components/parameters/ApiKey' }

const AUTH_ERRORS = {
  401: errorResponse(`\`${RESERVED_KEYS.invalid}\` → \`invalid_api_key\` (code guessed); \`${RESERVED_KEYS.noKey}\` → \`auth_required\``),
  429: errorResponse(`\`${RESERVED_KEYS.rateLimited}\` → \`rate_limited\`, with \`Retry-After: 60\` (code and header guessed)`),
}

const KNOWN_STATE_COUNT = Object.keys(KNOWN_STATES).length

const namedCodes = (field: string) => {
  return {
    type: 'object',
    required: [field],
    properties: { [field]: { type: 'array', items: { $ref: '#/components/schemas/NamedCode' } } },
  }
}

const segmentParam = (opts: { name: string, example: string, description: string }) => {
  return { name: opts.name, in: 'query', required: true, schema: { type: 'string' }, example: opts.example, description: opts.description }
}

const STATE_PARAM = segmentParam({ name: 'state', example: 'FC', description: `2-letter state code, one of the ${KNOWN_STATE_COUNT} the mock knows` })
const LGA_PARAM = segmentParam({ name: 'lga', example: '01', description: '2-digit LGA code' })
const DISTRICT_PARAM = segmentParam({ name: 'district', example: 'A01', description: '3-character district code' })
const REFERENCE_400 = 'code `invalid_request` (guessed: NIPOST names no code)'

const DESCRIPTION = `**Unofficial.** A mock of the [NIPOST Postcode API](https://docs.postcode.gov.ng), not affiliated with NIPOST or the Federal Ministry of Communications, Innovation and Digital Economy.

Same paths, parameters and response shapes as the real API, built from its public docs and OpenAPI spec. No sign-up: any key, or none, gets every lookup level. Apart from NIPOST's published postcodes and the names of the ${KNOWN_STATE_COUNT} states the mock knows (of NIPOST's 37), the data is mock data, labelled \`MOCK\`, and every body carries \`"mock": true\`.

**Keys.** Every endpoint has an \`X-API-Key\` dropdown. Leave it empty for full access at every level, or pick a key to exercise error handling:

| Key | Behaviour |
|---|---|
${KEY_BEHAVIOUR.map(row => `| \`${row.key}\` | ${row.behaviour} |`).join('\n')}

**Sandbox keys.** NIPOST's sandbox keys start with \`${SANDBOX_KEY_PREFIX}\`. Under one, the mock resolves only the five sandbox postcodes NIPOST publishes (NIPOST's own sandbox holds more): ${SANDBOX_POSTCODES.map(code => `\`${code}\``).join(', ')}. Under such a key every other code, the sample postcodes included, comes back \`valid: false\`; lookups are free and never capped. A key starting \`nipost_live_\` behaves as above except that the sandbox postcodes come back \`valid: false\`, since NIPOST says they resolve only under a test key. Any other key, or none, behaves as above.

Source and npm package: [github.com/poliha/ng-postcode](https://github.com/poliha/ng-postcode). To switch to the real API, use \`https://api.postcode.gov.ng\` with your own key.`

export const mockOpenApi = () => {
  return {
    openapi: '3.1.0',
    info: {
      title: 'NIPOST Postcode API mock (unofficial)',
      version,
      description: DESCRIPTION,
      license: { name: 'MIT', url: 'https://github.com/poliha/ng-postcode/blob/main/LICENSE' },
    },
    servers: [{ url: '/', description: 'This mock' }],
    tags: [
      { name: 'Lookup' },
      { name: 'Search' },
      { name: 'Assembly', description: 'Build and parse postcodes. The same rules work offline with the `ng-postcode` package.' },
      { name: 'Reference', description: `States, LGAs, districts and areas, for building pickers. Free, no credits. The mock knows ${KNOWN_STATE_COUNT} of NIPOST's 37 states; LGA names are mock data, and districts and areas are generated codes.` },
    ],
    paths: {
      '/v1/lookup': {
        get: {
          tags: ['Lookup'],
          summary: 'Graded postcode lookup (levels 1–5, cumulative)',
          description: `L1 is validity only. L2 adds the administrative and recent house address, L3 building use, L4 other building info, L5 a point. Fields beyond L2 are mock data, and the L4/L5 shapes are guessed because NIPOST has not published them. Under a sandbox key (\`${SANDBOX_KEY_PREFIX}…\`) only the five sandbox postcodes are valid.`,
          parameters: [
            { name: 'code', in: 'query', required: true, schema: { type: 'string' }, example: POSTCODE_EXAMPLE, description: 'Any style: `LA-11-W06-TC-10`, `LA 11 W06 TC 10`, `la11w06tc10`' },
            { name: 'level', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 5, default: 1 }, example: 3 },
            API_KEY_PARAM,
          ],
          responses: {
            200: okResponse({ $ref: '#/components/schemas/LookupResponse' }, 'Graded attributes. A malformed code returns `valid: false`.'),
            400: errorResponse('Missing code, or level outside 1–5'),
            402: errorResponse(`\`${RESERVED_KEYS.noCredits}\` on L2+`),
            403: errorResponse(`\`${RESERVED_KEYS.noScope}\` → \`level_not_granted\` on L2+`),
            ...AUTH_ERRORS,
          },
        },
      },
      '/v1/search/autocomplete': {
        get: {
          tags: ['Search'],
          summary: 'Segment-aware autocomplete',
          description: 'Suggests the segment being typed, from NIPOST\'s published sample postcodes and the quickstart example, or from the sandbox postcodes under a sandbox key.',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' }, example: 'EK 01', description: 'Partial postcode, with or without separators' },
            API_KEY_PARAM,
          ],
          responses: {
            200: okResponse({ $ref: '#/components/schemas/AutocompleteResponse' }, 'Suggestions for the active segment'),
            400: errorResponse('Missing q, or input that cannot start a postcode'),
            ...AUTH_ERRORS,
          },
        },
      },
      '/v1/search/reverse': {
        get: {
          tags: ['Search'],
          summary: 'Reverse geocode',
          description: 'Returns a random well-formed postcode whose state is the nearest of the known states to the coordinate. Nothing is found outside Nigeria.',
          parameters: [
            { name: 'lng', in: 'query', required: true, schema: { type: 'number', minimum: -180, maximum: 180 }, example: 3.3792 },
            { name: 'lat', in: 'query', required: true, schema: { type: 'number', minimum: -90, maximum: 90 }, example: 6.5244 },
            { name: 'max_distance_m', in: 'query', required: false, schema: { type: 'number', minimum: 0, maximum: 250, default: 25 }, description: 'Clamped to 250' },
            API_KEY_PARAM,
          ],
          responses: {
            200: okResponse({ $ref: '#/components/schemas/ReverseResponse' }, 'Resolved postcode, or `found: false`'),
            400: errorResponse('Missing or out-of-range coordinates'),
            ...AUTH_ERRORS,
          },
        },
      },
      '/v1/search/nearby': {
        get: {
          tags: ['Search'],
          summary: 'Location search',
          description: 'NIPOST publishes no response shape for this endpoint; `results` follows the hint in its widget docs.',
          parameters: [
            { name: 'lng', in: 'query', required: true, schema: { type: 'number', minimum: -180, maximum: 180 }, example: 7.4951 },
            { name: 'lat', in: 'query', required: true, schema: { type: 'number', minimum: -90, maximum: 90 }, example: 9.0579 },
            { name: 'radius', in: 'query', required: false, schema: { type: 'number', exclusiveMinimum: 0, maximum: 300, default: 300 }, description: 'Clamped to 300' },
            API_KEY_PARAM,
          ],
          responses: {
            200: okResponse({ $ref: '#/components/schemas/NearbyResponse' }, 'Units within the radius'),
            400: errorResponse('Missing or out-of-range coordinates or radius'),
            ...AUTH_ERRORS,
          },
        },
      },
      '/v1/reference/states': {
        get: {
          tags: ['Reference'],
          summary: 'List states',
          description: `NIPOST lists all 37 states. The mock lists the ${KNOWN_STATE_COUNT} whose codes NIPOST has published, with their real names.`,
          parameters: [API_KEY_PARAM],
          responses: {
            200: okResponse(namedCodes('states'), `The ${KNOWN_STATE_COUNT} states the mock knows (code and name)`),
            ...AUTH_ERRORS,
          },
        },
      },
      '/v1/reference/lgas': {
        get: {
          tags: ['Reference'],
          summary: 'List LGAs in a state',
          description: 'LGAs 01 to 40 for every known state, named `MOCK LGA NN` as lookups name them (EK-01 is ADO EKITI, from NIPOST\'s docs).',
          parameters: [STATE_PARAM, API_KEY_PARAM],
          responses: {
            200: okResponse(namedCodes('lgas'), 'LGAs of the state (code and mock name)'),
            400: errorResponse(`Missing, malformed or unknown state; ${REFERENCE_400}`),
            ...AUTH_ERRORS,
          },
        },
      },
      '/v1/reference/districts': {
        get: {
          tags: ['Reference'],
          summary: 'List districts in a state and LGA',
          description: 'Generated district codes, code only, the same on every call. Always includes the districts of NIPOST\'s published postcodes. An LGA the mock does not list gives an empty list.',
          parameters: [STATE_PARAM, LGA_PARAM, API_KEY_PARAM],
          responses: {
            200: okResponse(namedCodes('districts'), 'District codes'),
            400: errorResponse(`Missing or malformed state or lga, or unknown state; ${REFERENCE_400}`),
            ...AUTH_ERRORS,
          },
        },
      },
      '/v1/reference/areas': {
        get: {
          tags: ['Reference'],
          summary: 'List areas in a state, LGA and district',
          description: 'Generated area codes, code only, the same on every call. Always includes the areas of NIPOST\'s published postcodes. A district the mock does not list gives an empty list.',
          parameters: [STATE_PARAM, LGA_PARAM, DISTRICT_PARAM, API_KEY_PARAM],
          responses: {
            200: okResponse(namedCodes('areas'), 'Area codes'),
            400: errorResponse(`Missing or malformed state, lga or district, or unknown state; ${REFERENCE_400}`),
            ...AUTH_ERRORS,
          },
        },
      },
      '/v1/assembly/assemble': {
        post: {
          tags: ['Assembly'],
          summary: 'Assemble segments into a canonical postcode',
          parameters: [API_KEY_PARAM],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Segments' },
                example: { state: 'ek', lga: '1', district: 'a03', area: 'fk', unit: '1' },
              },
            },
          },
          responses: {
            200: okResponse({ $ref: '#/components/schemas/Formatted' }, 'Zero-filled and formatted'),
            400: errorResponse('A segment is invalid'),
            ...AUTH_ERRORS,
          },
        },
      },
      '/v1/assembly/disassemble': {
        get: {
          tags: ['Assembly'],
          summary: 'Disassemble a postcode into segments',
          parameters: [
            { name: 'code', in: 'query', required: true, schema: { type: 'string' }, example: 'EK01A03FK01' },
            API_KEY_PARAM,
          ],
          responses: {
            200: okResponse({ $ref: '#/components/schemas/Segments' }, 'Segments'),
            400: errorResponse('Not a postcode'),
            ...AUTH_ERRORS,
          },
        },
      },
    },
    components: {
      parameters: {
        ApiKey: {
          name: 'X-API-Key',
          in: 'header',
          required: false,
          description: `Optional. Empty means full access; a reserved key triggers its behaviour, and a sandbox key (\`${SANDBOX_KEY_PREFIX}…\`) resolves only the sandbox postcodes. The real API takes your key in this same header.`,
          schema: { type: 'string', enum: KEY_BEHAVIOUR.map(row => row.key) },
        },
      },
      schemas: {
        NamedCode: {
          type: 'object',
          description: 'A code with an optional name. Districts and areas are code-only.',
          required: ['code'],
          properties: {
            code: { type: 'string', example: 'FC' },
            name: { type: 'string', example: 'FCT' },
          },
        },
        Segments: {
          type: 'object',
          required: ['state', 'lga', 'district', 'area', 'unit'],
          properties: {
            state: { type: 'string', example: 'EK' },
            lga: { type: 'string', example: '01' },
            district: { type: 'string', example: 'A03' },
            area: { type: 'string', example: 'FK' },
            unit: { type: 'string', example: '01' },
          },
        },
        Formatted: {
          type: 'object',
          required: ['postcode', 'display', 'compact'],
          properties: {
            postcode: { type: 'string', example: 'EK-01-A03-FK-01' },
            display: { type: 'string', example: 'EK 01 A03 FK 01' },
            compact: { type: 'string', example: 'EK01A03FK01' },
          },
        },
        LookupResponse: {
          type: 'object',
          required: ['postcode', 'valid'],
          properties: {
            postcode: { type: 'string' },
            valid: { type: 'boolean' },
            administrative_address: {
              type: 'object',
              description: 'L2+',
              required: ['state_name', 'lga_name', 'locality_name', 'zone'],
              properties: {
                state_name: { type: 'string' },
                lga_name: { type: 'string' },
                locality_name: { type: 'string' },
                zone: { type: 'string' },
              },
            },
            recent_house_address: {
              type: 'object',
              description: 'L2+',
              required: ['recent'],
              properties: { recent: { type: 'string' } },
            },
            building_use_status: { type: 'string', description: 'L3+. Random per postcode.' },
            other_building_info: { type: 'object', description: 'L4+. Guessed shape, marked `mock: true`.' },
            point_geometry: {
              type: 'object',
              description: 'L5. GeoJSON Point near the centre of the postcode\'s state, marked `mock: true`. Guessed shape.',
              required: ['type', 'coordinates'],
              properties: {
                type: { type: 'string', const: 'Point' },
                coordinates: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                mock: { type: 'boolean' },
              },
            },
          },
        },
        AutocompleteResponse: {
          type: 'object',
          required: ['segment', 'suggestions'],
          properties: {
            segment: { type: 'string', enum: ['state', 'lga', 'district', 'area', 'unit'] },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'label'],
                properties: { code: { type: 'string' }, label: { type: 'string' } },
              },
            },
          },
        },
        ReverseResponse: {
          type: 'object',
          required: ['found', 'coordinate', 'radius_m'],
          properties: {
            found: { type: 'boolean' },
            coordinate: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: '[lng, lat] echoed back' },
            unit: {
              type: 'object',
              required: ['postcode', 'display', 'distance_m', 'confidence'],
              properties: {
                postcode: { type: 'string' },
                display: { type: 'string' },
                distance_m: { type: 'number' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                state_name: { type: 'string', description: 'L2+' },
                lga_name: { type: 'string', description: 'L2+' },
                locality_name: { type: 'string', description: 'L2+' },
                address: { type: 'string', description: 'L2+' },
              },
            },
            area: { type: 'string' },
            district: { type: 'string' },
            state: { type: 'string' },
            message: { type: 'string', description: 'Set when found is false' },
            radius_m: { type: 'number' },
          },
        },
        NearbyResponse: {
          type: 'object',
          required: ['results', 'radius_m'],
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                required: ['postcode', 'display', 'distance_m'],
                properties: {
                  postcode: { type: 'string' },
                  display: { type: 'string' },
                  distance_m: { type: 'number' },
                },
              },
            },
            radius_m: { type: 'number' },
          },
        },
        Error: {
          type: 'object',
          required: ['error', 'mock'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: { code: { type: 'string' }, message: { type: 'string' } },
            },
            mock: { type: 'boolean', const: true },
          },
        },
      },
    },
  }
}
