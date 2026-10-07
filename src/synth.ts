// Deterministic mock data. The same postcode or coordinate always produces the same answer, so
// tests stay stable. Anything that would be a real-world fact NIPOST has not published (LGA
// names, street addresses, building use, coordinates) is mock data, and the text values say so.

import { disassemble, format, type Segments } from './format'
import { KNOWN_LGAS, KNOWN_STATES, SANDBOX_POSTCODES, TEST_POSTCODES } from './data'
import type { AdministrativeAddress, NamedCode } from './types'

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** LGAs per state in the mock, 01 to 40: the range postcodeAt draws from, so its LGAs are always listed. */
export const MOCK_LGA_COUNT = 40

/** FNV-1a: small, fast and stable across platforms. */
export const hash = (input: string): number => {
  let h = 0x811C9DC5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const twoDigits = (n: number): string => {
  return String(n).padStart(2, '0')
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

/** The documented LGA name where NIPOST has published one (EK-01 is ADO EKITI), otherwise mock. */
export const lgaName = (opts: { state: string, lga: string }): string => {
  return KNOWN_LGAS[`${opts.state}-${opts.lga}`] ?? `MOCK LGA ${opts.lga}`
}

export const administrativeAddress = (s: Segments): AdministrativeAddress => {
  const lga = lgaName(s)
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

/**
 * Random per postcode. The spec types this as a plain string, so it cannot carry a mock label.
 * NIPOST describes every sandbox postcode as a public building, so those read `public`.
 */
export const buildingUse = (s: Segments): string => {
  const compact = format(s).compact
  if (SANDBOX_POSTCODES.some(code => format(code).compact === compact)) {
    return 'public'
  }
  return pick(BUILDING_USES, hash(compact))
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

/**
 * A stable, well-formed postcode for a coordinate, used by reverse and nearby search. The state is
 * the nearest known state; the other segments are random.
 */
export const postcodeAt = (opts: { lng: number, lat: number, salt?: string }): Segments => {
  const h = hash(`${round(opts.lng, 4)},${round(opts.lat, 4)}${opts.salt ?? ''}`)
  const h2 = hash(`${h}`)
  return {
    state: nearestState(opts.lng, opts.lat),
    lga: twoDigits(1 + (h % MOCK_LGA_COUNT)),
    district: pick(ALPHA, h >>> 3) + String((h >>> 7) % 100).padStart(2, '0'),
    area: pick(ALPHA, h2) + pick(ALPHA, h2 >>> 5),
    unit: String(1 + ((h2 >>> 10) % 99)).padStart(2, '0'),
  }
}

// Reference data (/v1/reference/*). Each list is deterministic per parent and always includes the
// segments of NIPOST's published postcodes, so drilling down from a state reaches every one of them.

const PUBLISHED: readonly Segments[] = [...TEST_POSTCODES, ...SANDBOX_POSTCODES].map(code => disassemble(code))

/** Four to eight generated values plus the published ones, deduplicated and sorted. */
const mockList = (opts: { seed: string, make: (h: number) => string, published: string[] }): string[] => {
  const count = 4 + (hash(`count:${opts.seed}`) % 5)
  const values = new Set(opts.published)
  for (let i = 0; i < count; i++) {
    values.add(opts.make(hash(`${opts.seed}:${i}`)))
  }
  return [...values].sort()
}

/** The known states, by code, with their real names. */
export const referenceStates = (): NamedCode[] => {
  return Object.keys(KNOWN_STATES).sort().map(code => ({ code, name: stateName(code) }))
}

/** LGAs 01 to 40 of a state, named as lookups name them. */
export const referenceLgas = (state: string): NamedCode[] => {
  return Array.from({ length: MOCK_LGA_COUNT }, (_, i) => {
    const lga = twoDigits(i + 1)
    return { code: lga, name: lgaName({ state, lga }) }
  })
}

/** District codes of a state's LGA; empty for an LGA the mock does not list. */
export const referenceDistricts = (opts: { state: string, lga: string }): NamedCode[] => {
  if (!referenceLgas(opts.state).some(l => l.code === opts.lga)) {
    return []
  }
  const codes = mockList({
    seed: `district:${opts.state}-${opts.lga}`,
    make: h => pick(ALPHA, h) + twoDigits(1 + ((h >>> 5) % 99)),
    published: PUBLISHED.filter(s => s.state === opts.state && s.lga === opts.lga).map(s => s.district),
  })
  return codes.map(code => ({ code }))
}

/** Area codes of a district; empty for a district the mock does not list. */
export const referenceAreas = (opts: { state: string, lga: string, district: string }): NamedCode[] => {
  if (!referenceDistricts(opts).some(d => d.code === opts.district)) {
    return []
  }
  const codes = mockList({
    seed: `area:${opts.state}-${opts.lga}-${opts.district}`,
    make: h => pick(ALPHA, h) + pick(ALPHA, h >>> 5),
    published: PUBLISHED
      .filter(s => s.state === opts.state && s.lga === opts.lga && s.district === opts.district)
      .map(s => s.area),
  })
  return codes.map(code => ({ code }))
}
