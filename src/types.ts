// Response types for the NIPOST Postcode API, written against spec/openapi.yaml (v0.1.0, fetched
// 2026-10-06) and the worked examples in the docs. Where the spec types a field only as `object`,
// the inner fields come from the docs' examples; fields marked "guessed" have no published shape.

import type { Segments } from './format'

export interface ApiEnvelope<T> {
  data: T
}

export interface ApiErrorBody {
  error: { code: string, message: string }
}

export type LookupLevel = 1 | 2 | 3 | 4 | 5

export interface AdministrativeAddress {
  state_name: string
  lga_name: string
  locality_name: string
  zone: string
}

export interface LookupResponse {
  postcode: string
  valid: boolean
  /** L2+ */
  administrative_address?: AdministrativeAddress
  /** L2+ */
  recent_house_address?: { recent: string }
  /** L3+ */
  building_use_status?: string
  /** L4+. Typed only as `object` in the spec; the mock's fields are guessed. */
  other_building_info?: Record<string, unknown>
  /** L5, restricted. Typed only as `object` in the spec; the mock returns a GeoJSON Point (guessed). */
  point_geometry?: Record<string, unknown>
}

export type AssembleResponse = { postcode: string, display: string, compact: string }

export type DisassembleResponse = Segments

export interface AutocompleteResponse {
  segment: keyof Segments
  suggestions: { code: string, label: string }[]
}

/**
 * The spec gives no response schema for /v1/search/nearby; this shape is guessed. `results` follows
 * the only published hint, the widget nearby endpoint's "under `data.results`".
 */
export interface NearbyResponse {
  results: { postcode: string, display: string, distance_m: number }[]
  radius_m: number
}

export interface ReverseResponse {
  found: boolean
  /** [lng, lat] echoed back */
  coordinate: [number, number]
  unit?: {
    postcode: string
    display: string
    distance_m: number
    confidence: 'high' | 'medium' | 'low'
    /** L2+ */
    state_name?: string
    /** L2+ */
    lga_name?: string
    /** L2+ */
    locality_name?: string
    /** L2+ */
    address?: string
  }
  area?: string
  district?: string
  state?: string
  /** Set when found is false */
  message?: string
  radius_m: number
}

/** The spec's `NamedCode`. Districts and areas are code-only, so they carry no `name`. */
export interface NamedCode {
  code: string
  name?: string
}

/** GET /v1/reference/states. NIPOST lists all 37 states; the mock knows 11 of them. */
export interface StatesResponse {
  states: NamedCode[]
}

/** GET /v1/reference/lgas?state= */
export interface LgasResponse {
  lgas: NamedCode[]
}

/** GET /v1/reference/districts?state=&lga= (code only) */
export interface DistrictsResponse {
  districts: NamedCode[]
}

/** GET /v1/reference/areas?state=&lga=&district= (code only) */
export interface AreasResponse {
  areas: NamedCode[]
}
