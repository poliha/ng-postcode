// Shared by the mock and its OpenAPI description, kept apart so neither imports the other.

/**
 * Reserved API keys. Send one in `X-API-Key` to make the mock behave as the real gateway would in
 * that situation. Any other key, or no key at all, gets full access at every level, so nobody
 * needs an account to try the API. This is a static list; the mock keeps no state.
 */
export const RESERVED_KEYS = {
  /** 401: the key is not recognised. */
  invalid: 'mock_invalid',
  /** 401: behave as the real gateway does today when no key is sent. */
  noKey: 'mock_no_key',
  /** 402 on credit-consuming calls (Lookup L2+). */
  noCredits: 'mock_no_credits',
  /** 403 `level_not_granted` on Lookup L2+: the organisation has not been granted that level. */
  noScope: 'mock_no_scope',
  /** 429 on every call. */
  rateLimited: 'mock_rate_limited',
  /** `mock_level_1` … `mock_level_5`: caps lookups at that level, as an organisation's granted level does. */
  levelPrefix: 'mock_level_',
} as const

/**
 * NIPOST's sandbox keys start with this. Under one, only SANDBOX_POSTCODES resolve; every other
 * code, the sample postcodes included, comes back `valid: false`. Sandbox lookups are free at
 * every level and never capped.
 */
export const SANDBOX_KEY_PREFIX = 'nipost_test_'

/**
 * NIPOST's live keys start with this. Under one, the sandbox postcodes come back `valid: false`,
 * since NIPOST says they resolve only under a test key.
 */
export const LIVE_KEY_PREFIX = 'nipost_live_'

/** The sandbox key the docs page offers in its dropdown. Any key with the prefix behaves the same. */
export const SANDBOX_KEY_EXAMPLE = `${SANDBOX_KEY_PREFIX}mock`

export const RATE_LIMIT = 600

/** Every key the docs page offers, with what it does: the reserved keys, then a sandbox key. */
export const KEY_BEHAVIOUR: readonly { key: string, behaviour: string }[] = [
  ...[1, 2, 3, 4, 5].map(level => ({
    key: `${RESERVED_KEYS.levelPrefix}${level}`,
    behaviour: `Lookups capped at level ${level}; asking for more returns the fields up to L${level}`,
  })),
  { key: RESERVED_KEYS.noCredits, behaviour: '402 `insufficient_credits` on Lookup L2+' },
  { key: RESERVED_KEYS.noScope, behaviour: '403 `level_not_granted` on Lookup L2+' },
  { key: RESERVED_KEYS.rateLimited, behaviour: '429 `rate_limited` on every call' },
  { key: RESERVED_KEYS.invalid, behaviour: '401 `invalid_api_key`' },
  { key: RESERVED_KEYS.noKey, behaviour: '401 `auth_required`, as the real gateway answers with no key' },
  {
    key: SANDBOX_KEY_EXAMPLE,
    behaviour: `A sandbox key, like any key starting \`${SANDBOX_KEY_PREFIX}\`: only the five sandbox postcodes resolve, at any level, with no credits used`,
  },
]
