import { describe, expect, it } from 'vitest'
import {
  assemble, disassemble, format, isValidFormat, parse, parsePartial, PostcodeFormatError, SANDBOX_POSTCODES,
  TEST_POSTCODES,
} from '../src/index'

const EK = { state: 'EK', lga: '01', district: 'A03', area: 'FK', unit: '01' }

describe('format', () => {
  it('produces all three styles', () => {
    expect(format('EK-01-A03-FK-01')).toEqual({
      postcode: 'EK-01-A03-FK-01',
      display: 'EK 01 A03 FK 01',
      compact: 'EK01A03FK01',
    })
  })

  it.each(['EK-01-A03-FK-01', 'EK 01 A03 FK 01', 'ek01a03fk01', ' Ek-01 a03-fk 01 '])('accepts %j', (input) => {
    expect(format(input).postcode).toBe('EK-01-A03-FK-01')
  })

  it('parses every published sample and sandbox postcode', () => {
    for (const code of [...TEST_POSTCODES, ...SANDBOX_POSTCODES]) {
      expect(parse(code)?.postcode).toBe(code)
    }
  })
})

describe('assemble', () => {
  it('zero-fills and upper-cases, matching the docs example', () => {
    expect(assemble({ state: 'ek', lga: '1', district: 'a03', area: 'fk', unit: '1' })).toEqual({
      postcode: 'EK-01-A03-FK-01',
      display: 'EK 01 A03 FK 01',
      compact: 'EK01A03FK01',
    })
  })

  it.each(['ß', 'ﬀ', 'ı'])('rejects a state segment of %j, which upper-cases to ASCII', (state) => {
    expect(() => assemble({ ...EK, state })).toThrow(PostcodeFormatError)
  })

  it('accepts numbers for numeric segments', () => {
    expect(assemble({ state: 'LA', lga: 11, district: 'W06', area: 'TC', unit: 10 }).postcode).toBe('LA-11-W06-TC-10')
  })

  it.each([
    [{ lga: '01', district: 'A03', area: 'FK', unit: '01' }, 'state'],
    [{ ...EK, state: 'E1' }, 'state'],
    [{ ...EK, lga: '00' }, 'lga'],
    [{ ...EK, lga: '100' }, 'lga'],
    [{ ...EK, district: 'A3' }, 'district'],
    [{ ...EK, area: 'F1' }, 'area'],
    [{ ...EK, unit: '0' }, 'unit'],
  ])('rejects %j at the %s segment', (segments, segment) => {
    expect(() => assemble(segments)).toThrow(PostcodeFormatError)
    try {
      assemble(segments)
    }
    catch (err) {
      expect((err as PostcodeFormatError).segment).toBe(segment)
    }
  })
})

describe('disassemble', () => {
  it('splits a compact code', () => {
    expect(disassemble('EK01A03FK01')).toEqual(EK)
  })

  it('zero-fills short numeric parts when separators are present', () => {
    expect(disassemble('EK-1-A03-FK-1')).toEqual(EK)
  })

  it('falls back to the compact form when separators are misplaced', () => {
    expect(disassemble('EK0 1A 03F K0 1')).toEqual(EK)
    expect(disassemble('EK0 1A03FK01')).toEqual(EK)
  })

  it.each(['', 'EK01A03FK0', 'EK01A03FK011', 'EK00A03FK01', 'EK01A03FK00', '1K01A03FK01'])('rejects %j', (code) => {
    expect(() => disassemble(code)).toThrow(PostcodeFormatError)
    expect(isValidFormat(code)).toBe(false)
  })

  it.each(['ß01A03FK01', 'EK01A03ﬀ01', 'ık01A03FK01', 'ЕK01A03FK01'])('rejects non-ASCII look-alikes in %j', (code) => {
    expect(isValidFormat(code)).toBe(false)
  })
})

describe('parsePartial', () => {
  it.each([
    { q: '', active: 'state', fragment: '' },
    { q: 'E', active: 'state', fragment: 'E' },
    { q: 'EK', active: 'lga', fragment: '' },
    { q: 'EK01', active: 'district', fragment: '' },
    { q: 'EK 01 A', active: 'district', fragment: 'A' },
    { q: 'EK-01-A03', active: 'area', fragment: '' },
    { q: 'EK01A03FK', active: 'unit', fragment: '' },
    { q: 'EK01A03FK0', active: 'unit', fragment: '0' },
    { q: 'EK 01 A03 FK 01', active: 'unit', fragment: '01' },
    { q: 'EK 1 A', active: 'district', fragment: 'A' },
    { q: 'EK 1 ', active: 'district', fragment: '' },
  ])('$q is typing the $active segment', ({ q, active, fragment }) => {
    const result = parsePartial(q)
    expect(result?.active).toBe(active)
    expect(result?.fragment).toBe(fragment)
  })

  it('zero-fills a one-digit LGA typed with separators', () => {
    expect(parsePartial('EK 1 A03')?.complete).toEqual({ state: 'EK', lga: '01', district: 'A03' })
  })

  it.each(['EK01A03FK01XYZ', 'EK 01 A03 FK 01 X', 'EK 01 A03 FK 01 ', 'EK 0X A'])('rejects %j', (q) => {
    expect(parsePartial(q)).toBeNull()
  })
})
