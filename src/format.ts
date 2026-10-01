// Nigerian postcode format, as published at https://docs.postcode.gov.ng/concepts/postcode-format
//
//   AA 99 H77 BB 55      e.g.  EK 01 A03 FK 01
//   │  │  │   │  └─ unit      building unit within the area   (2 numeric, 01–99)
//   │  │  │   └──── area      area within the district        (2 alpha)
//   │  │  └──────── district  district within the LGA         (3 alphanumeric)
//   │  └─────────── lga       LGA within the state            (2 numeric, 01–99)
//   └────────────── state     state                           (2 alpha)
//
// Input is tolerant of spaces, hyphens and case. Numeric segments are zero-filled.

export interface Segments {
  state: string
  lga: string
  district: string
  area: string
  unit: string
}

export type SegmentName = keyof Segments

export interface FormattedPostcode {
  /** Hyphenated canonical form, e.g. `EK-01-A03-FK-01` */
  postcode: string
  /** Spaced display form, e.g. `EK 01 A03 FK 01` */
  display: string
  /** Compact form, e.g. `EK01A03FK01` */
  compact: string
}

export const SEGMENT_ORDER: readonly SegmentName[] = ['state', 'lga', 'district', 'area', 'unit']

const SEGMENT_LENGTHS: Record<SegmentName, number> = { state: 2, lga: 2, district: 3, area: 2, unit: 2 }

const SEGMENT_RULES: Record<SegmentName, { pattern: RegExp, numeric: boolean, description: string }> = {
  state: { pattern: /^[A-Z]{2}$/, numeric: false, description: '2 letters' },
  lga: { pattern: /^\d{2}$/, numeric: true, description: '2 digits, 01–99' },
  district: { pattern: /^[A-Z0-9]{3}$/, numeric: false, description: '3 letters or digits' },
  area: { pattern: /^[A-Z]{2}$/, numeric: false, description: '2 letters' },
  unit: { pattern: /^\d{2}$/, numeric: true, description: '2 digits, 01–99' },
}

const COMPACT = /^([A-Z]{2})(\d{2})([A-Z0-9]{3})([A-Z]{2})(\d{2})$/
const SEPARATORS = /[\s-]+/

export class PostcodeFormatError extends Error {
  constructor(message: string, readonly segment?: SegmentName) {
    super(message)
    this.name = 'PostcodeFormatError'
  }
}

/**
 * Upper-cases ASCII letters only. `String.prototype.toUpperCase` maps some non-ASCII characters
 * to ASCII (`ß` → `SS`, `ﬀ` → `FF`), which would let them through the ASCII-only patterns.
 */
const upperAscii = (value: string): string => value.replace(/[a-z]/g, c => c.toUpperCase())

const normaliseSegment = (name: SegmentName, raw: unknown): string => {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new PostcodeFormatError(`${name} is required`, name)
  }
  const rule = SEGMENT_RULES[name]
  let value = upperAscii(String(raw).trim())
  if (rule.numeric && /^\d$/.test(value)) {
    value = `0${value}`
  }
  if (!rule.pattern.test(value) || (rule.numeric && value === '00')) {
    throw new PostcodeFormatError(`${name} must be ${rule.description}, got "${String(raw)}"`, name)
  }
  return value
}

const normaliseSegments = (raw: Partial<Record<SegmentName, string | number>>): Segments => {
  const s = {} as Segments
  for (const name of SEGMENT_ORDER) {
    s[name] = normaliseSegment(name, raw[name])
  }
  return s
}

const fromParts = (parts: string[]): Segments => {
  const [state, lga, district, area, unit] = parts
  return normaliseSegments({ state, lga, district, area, unit })
}

/** Formats segments, or a postcode in any accepted style, into all three styles. */
export const format = (input: Segments | string): FormattedPostcode => {
  let s: Segments
  if (typeof input === 'string') {
    s = disassemble(input)
  }
  else {
    s = normaliseSegments(input)
  }
  const ordered = SEGMENT_ORDER.map(name => s[name])
  return {
    postcode: ordered.join('-'),
    display: ordered.join(' '),
    compact: ordered.join(''),
  }
}

/** Builds a postcode from its five segments, zero-filling the numeric ones. Throws on invalid input. */
export const assemble = (segments: Partial<Record<SegmentName, string | number>>): FormattedPostcode => {
  return format(normaliseSegments(segments))
}

/** Splits a postcode in any accepted style into its five segments. Throws on invalid input. */
export const disassemble = (code: string): Segments => {
  if (typeof code !== 'string') {
    throw new PostcodeFormatError('postcode must be a string')
  }
  const trimmed = code.trim()
  if (/[^\x20-\x7E]/.test(trimmed.replace(/\s/g, ' '))) {
    throw new PostcodeFormatError(`"${code}" contains characters a postcode cannot have`)
  }
  const upper = upperAscii(trimmed)

  // Five separated parts are read as segments, so short numeric parts can be zero-filled. If they
  // do not form a postcode, the separators may just be misplaced, so fall back to the compact form.
  const parts = upper.split(SEPARATORS).filter(Boolean)
  if (parts.length === 5) {
    try {
      return fromParts(parts)
    }
    catch (err) {
      if (!(err instanceof PostcodeFormatError)) {
        throw err
      }
    }
  }

  const m = COMPACT.exec(upper.replace(new RegExp(SEPARATORS, 'g'), ''))
  if (!m) {
    throw new PostcodeFormatError(`"${code}" is not a postcode; expected the form AA-99-H77-BB-55`)
  }
  return fromParts(m.slice(1))
}

/** Parses a postcode, returning `null` instead of throwing when it is malformed. */
export const parse = (code: string): (Segments & FormattedPostcode) | null => {
  try {
    const segments = disassemble(code)
    return { ...segments, ...format(segments) }
  }
  catch (err) {
    if (err instanceof PostcodeFormatError) {
      return null
    }
    throw err
  }
}

/** True when the input is a well-formed postcode. Says nothing about whether the postcode exists. */
export const isValidFormat = (code: string): boolean => {
  return parse(code) !== null
}

export interface PartialPostcode {
  /** Segments already typed in full. */
  complete: Partial<Segments>
  /** The segment being typed now. */
  active: SegmentName
  /** What has been typed of the active segment so far. */
  fragment: string
}

const partialFromSeparated = (parts: string[], endsWithSeparator: boolean): PartialPostcode | null => {
  if (parts.length > SEGMENT_ORDER.length || (parts.length === SEGMENT_ORDER.length && endsWithSeparator)) {
    return null
  }
  const last = parts[parts.length - 1] ?? ''
  const lastName = SEGMENT_ORDER[parts.length - 1]
  // A last part typed to its full length counts as finished, as it does in compact input; the
  // unit is the exception, since nothing follows it.
  const lastIsFinished = endsWithSeparator
    || (lastName !== undefined && lastName !== 'unit' && last.length >= SEGMENT_LENGTHS[lastName])

  let done = parts.slice(0, -1)
  let typing = last
  if (lastIsFinished) {
    done = parts
    typing = ''
  }

  const complete: Partial<Segments> = {}
  for (const [i, part] of done.entries()) {
    const name = SEGMENT_ORDER[i]!
    try {
      complete[name] = normaliseSegment(name, part)
    }
    catch {
      return null
    }
  }
  return { complete, active: SEGMENT_ORDER[done.length]!, fragment: typing }
}

const partialFromCompact = (compact: string): PartialPostcode | null => {
  const complete: Partial<Segments> = {}
  let offset = 0
  for (const [i, name] of SEGMENT_ORDER.entries()) {
    const len = SEGMENT_LENGTHS[name]
    const piece = compact.slice(offset, offset + len)
    const isLast = i === SEGMENT_ORDER.length - 1
    if (piece.length < len || isLast) {
      if (isLast && compact.length > offset + len) {
        return null
      }
      return { complete, active: name, fragment: piece }
    }
    complete[name] = piece
    offset += len
  }
  /* c8 ignore next */
  return null
}

/**
 * Reads a partial postcode as typed into a search box, e.g. `EK 01 A` or `EK01A`. Returns the
 * segments typed in full and the segment being typed now, or `null` when the input cannot be the
 * start of a postcode (too long, or a separated segment that is invalid).
 */
export const parsePartial = (q: string): PartialPostcode | null => {
  const upper = upperAscii(q.trimStart())
  if (/[^\x20-\x7E]/.test(upper.replace(/\s/g, ' '))) {
    return null
  }
  if (SEPARATORS.test(upper)) {
    const parts = upper.split(SEPARATORS).filter(Boolean)
    const endsWithSeparator = /[\s-]$/.test(upper)
    return partialFromSeparated(parts, endsWithSeparator)
  }
  return partialFromCompact(upper)
}
