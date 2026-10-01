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
  /** 403 on Lookup L2+: the key lacks the lookup scope. */
  noScope: 'mock_no_scope',
  /** 429 on every call. */
  rateLimited: 'mock_rate_limited',
  /** `mock_level_1` … `mock_level_5`: caps lookups at that level, as an organisation's granted level does. */
  levelPrefix: 'mock_level_',
} as const

export const RATE_LIMIT = 600

/** Every reserved key with what it does, in the order the docs list them. */
export const RESERVED_KEY_BEHAVIOUR: readonly { key: string, behaviour: string }[] = [
  ...[1, 2, 3, 4, 5].map(level => ({
    key: `${RESERVED_KEYS.levelPrefix}${level}`,
    behaviour: `Lookups capped at level ${level}; asking for more returns the fields up to L${level}`,
  })),
  { key: RESERVED_KEYS.noCredits, behaviour: '402 `insufficient_credits` on Lookup L2+' },
  { key: RESERVED_KEYS.noScope, behaviour: '403 `insufficient_scope` on Lookup L2+' },
  { key: RESERVED_KEYS.rateLimited, behaviour: '429 `rate_limited` on every call' },
  { key: RESERVED_KEYS.invalid, behaviour: '401 `invalid_api_key`' },
  { key: RESERVED_KEYS.noKey, behaviour: '401 `auth_required`, as the real gateway answers today with no key' },
]
