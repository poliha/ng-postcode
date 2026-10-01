// Deterministic mock data. The same postcode or coordinate always produces the same answer, so
// tests stay stable. Anything that would be a real-world fact NIPOST has not published (LGA
// names, street addresses, building use, coordinates) is mock data, and the text values say so.

import { format, type Segments } from './format'
import { KNOWN_LGAS, KNOWN_STATES } from './data'
import type { AdministrativeAddress } from './types'

/** FNV-1a: small, fast and stable across platforms. */
export const hash = (input: string): number => {
  let h = 0x811C9DC5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const pick = <T>(items: ArrayLike<T>, seed: number): T => {
  return items[seed % items.length]!
}

export const round = (n: number, places: number): number => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

export const stateName = (state: string): string => {
  const known = KNOWN_STATES[state]
  if (known) {
    return known.name
  }
  return `MOCK STATE ${state}`
}

export const administrativeAddress = (s: Segments): AdministrativeAddress => {
  const lga = KNOWN_LGAS[`${s.state}-${s.lga}`] ?? `MOCK LGA ${s.lga}`
  return {
    state_name: stateName(s.state),
    lga_name: lga,
    locality_name: lga,
    zone: KNOWN_STATES[s.state]?.zone ?? 'MOCK ZONE',
  }
}

export const recentAddress = (s: Segments): string => {
  return `${Number(s.unit)} MOCK STREET, AREA ${s.area}, ${stateName(s.state)}`
}

const BUILDING_USES = ['residential', 'commercial', 'mixed'] as const

/** Random per postcode. The spec types this as a plain string, so it cannot carry a mock label. */
export const buildingUse = (s: Segments): string => {
  return pick(BUILDING_USES, hash(format(s).compact))
}

/** Guessed: NIPOST documents no inner fields for L4 `other_building_info`. */
export const otherBuildingInfo = (s: Segments): Record<string, unknown> => {
  const h = hash(`info:${format(s).compact}`)
  return {
    mock: true,
    note: 'NIPOST has not published the fields of other_building_info; these are placeholders.',
    floors: 1 + (h % 4),
    occupancy: pick(['occupied', 'vacant', 'under construction'], h >>> 3),
  }
}

/** A stable point near the centre of the postcode's state. Not the building's location. */
export const pointFor = (s: Segments): [number, number] => {
  const h = hash(`point:${format(s).compact}`)
  const centre = KNOWN_STATES[s.state]?.centre ?? [8.0, 9.0]
  const lng = centre[0] - 0.25 + ((h % 1000) / 1000) * 0.5
  const lat = centre[1] - 0.25 + (((h >>> 10) % 1000) / 1000) * 0.5
  return [round(lng, 6), round(lat, 6)]
}

/**
 * Guessed: the spec types L5 `point_geometry` only as `object`, so this is a GeoJSON Point.
 * `mock` is a GeoJSON foreign member marking the coordinates as made up.
 */
export const pointGeometry = (s: Segments): Record<string, unknown> => {
  return { type: 'Point', coordinates: pointFor(s), mock: true }
}

/** The known state whose rough centre is closest to a coordinate. */
export const nearestState = (lng: number, lat: number): string => {
  let best = 'FC'
  let bestDistance = Infinity
  for (const [code, state] of Object.entries(KNOWN_STATES)) {
    const distance = (state.centre[0] - lng) ** 2 + (state.centre[1] - lat) ** 2
    if (distance < bestDistance) {
      best = code
      bestDistance = distance
    }
  }
  return best
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * A stable, well-formed postcode for a coordinate, used by reverse and nearby search. The state is
 * the nearest known state; the other segments are random.
 */
export const postcodeAt = (opts: { lng: number, lat: number, salt?: string }): Segments => {
  const h = hash(`${round(opts.lng, 4)},${round(opts.lat, 4)}${opts.salt ?? ''}`)
  const h2 = hash(`${h}`)
  return {
    state: nearestState(opts.lng, opts.lat),
    lga: String(1 + (h % 40)).padStart(2, '0'),
    district: pick(ALPHA, h >>> 3) + String((h >>> 7) % 100).padStart(2, '0'),
    area: pick(ALPHA, h2) + pick(ALPHA, h2 >>> 5),
    unit: String(1 + ((h2 >>> 10) % 99)).padStart(2, '0'),
  }
}
