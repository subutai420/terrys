import { describe, expect, it } from 'vitest'

import {
  addDays,
  isIsoDate,
  parseTimeOfDay,
  toShopDate,
  toShopDateTime,
  weekdayOf,
} from './calendar'
import { formatPostcode, isValidPostcode, normalizePostcode } from './constants'
import {
  buildPostcodeCsv,
  decodeCsvBytes,
  parsePostcodeCsv,
  planPostcodeImport,
  type StoredPostcode,
} from './postcodeCsv'
import { matchSpecificity, normalizePatternText, parsePostcodePatterns } from './postcodePatterns'

describe('postcode helpers', () => {
  it('normalises, validates and formats postcodes', () => {
    expect(normalizePostcode(' 120 00 ')).toBe('12000')
    expect(isValidPostcode('120 00')).toBe(true)
    expect(isValidPostcode('020 00')).toBe(false)
    expect(isValidPostcode('811 01')).toBe(false) // Slovak
    expect(formatPostcode('12000')).toBe('120 00')
  })
})

describe('calendar helpers', () => {
  it('adds days across months, years and DST switches', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('knows weekdays and validates ISO dates and times', () => {
    expect(weekdayOf('2026-11-23')).toBe('mon')
    expect(weekdayOf('2026-11-22')).toBe('sun')
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(parseTimeOfDay('12:00')).toBe(43200)
    expect(parseTimeOfDay('7:30')).toBe(27000)
    expect(parseTimeOfDay('24:00')).toBeNull()
    expect(parseTimeOfDay('12')).toBeNull()
  })

  it('converts stored timestamps to the Prague calendar date', () => {
    // Admin in Prague picks 24. 12.: stored as midnight Prague = 23:00 UTC the day before.
    expect(toShopDate('2026-12-23T23:00:00.000Z')).toBe('2026-12-24')
    expect(toShopDate('2026-12-24T12:00:00.000Z')).toBe('2026-12-24')
    expect(toShopDate('2026-12-24')).toBe('2026-12-24')
    expect(toShopDateTime(new Date('2026-07-01T22:30:00Z'))).toEqual({
      date: '2026-07-02',
      secondsOfDay: 30 * 60,
    })
  })
})

describe('postcode patterns', () => {
  it('parses exact postcodes and prefixes, reports invalid tokens', () => {
    const { patterns, invalid } = parsePostcodePatterns('1*, 250 01;252*\n\n 9*, abc, 12345, 1*')
    expect(patterns).toEqual([
      { prefix: '1', exact: false },
      { prefix: '25001', exact: true },
      { prefix: '252', exact: false },
      { prefix: '12345', exact: true },
    ])
    expect(invalid).toEqual(['9*', 'abc'])
    expect(normalizePatternText('250 01,  1*')).toBe('25001, 1*')
  })

  it('scores more specific matches higher', () => {
    const { patterns } = parsePostcodePatterns('2*, 25*, 25001')
    expect(matchSpecificity(patterns, '25001')).toBe(6)
    expect(matchSpecificity(patterns, '25002')).toBe(2)
    expect(matchSpecificity(patterns, '29471')).toBe(1)
    expect(matchSpecificity(patterns, '12000')).toBe(0)
  })
})

describe('postcode CSV', () => {
  it('reads a semicolon file with Czech headers, BOM and quoted cells', () => {
    const csv =
      '﻿PSČ;Obec;Okres;Nedoručujeme\r\n' +
      '120 00;Praha 2;Hlavní město Praha;ne\r\n' +
      '# komentář\r\n' +
      '29471;"Benátky nad Jizerou; Nové Benátky";Mladá Boleslav;ano\r\n' +
      '\r\n' +
      '12000;Praha 2 znovu;;\r\n' +
      '0123;Špatně;;\r\n' +
      '60200;Brno;Brno-město;možná\r\n'
    const parsed = parsePostcodeCsv(csv.replace(/^﻿/, ''))
    expect(parsed.rows).toEqual([
      {
        line: 2,
        code: '12000',
        city: 'Praha 2',
        district: 'Hlavní město Praha',
        deliveryBlocked: false,
      },
      {
        line: 4,
        code: '29471',
        city: 'Benátky nad Jizerou; Nové Benátky',
        district: 'Mladá Boleslav',
        deliveryBlocked: true,
      },
    ])
    expect(parsed.duplicates).toBe(1)
    expect(parsed.errors.map((e) => e.line)).toEqual([7, 8])
  })

  it('reads comma files, files without a header and Česká pošta column names', () => {
    expect(parsePostcodeCsv('psc,obec\n12000,Praha 2\n').rows[0]).toMatchObject({
      code: '12000',
      city: 'Praha 2',
      deliveryBlocked: undefined,
    })
    expect(parsePostcodeCsv('12000;Praha 2;Praha\n60200;Brno;Brno-město').rows).toHaveLength(2)
    expect(
      parsePostcodeCsv('PSC;NAZPOST;NAZOKRESU\n29471;Benátky nad Jizerou;Mladá Boleslav').rows[0],
    ).toMatchObject({ city: 'Benátky nad Jizerou', district: 'Mladá Boleslav' })
  })

  it('reports a missing postcode column and an empty file', () => {
    expect(parsePostcodeCsv('mesto;okres\nPraha;Praha').errors[0].message).toContain('psc')
    expect(parsePostcodeCsv('').errors[0].message).toContain('prázdný')
  })

  it('decodes Windows-1250 files', () => {
    // "Plzeň" in Windows-1250: ň = 0xF2
    const bytes = new Uint8Array([0x50, 0x6c, 0x7a, 0x65, 0xf2])
    expect(decodeCsvBytes(bytes)).toBe('Plzeň')
    expect(decodeCsvBytes(new TextEncoder().encode('﻿Plzeň'))).toBe('Plzeň')
  })

  it('plans creates and updates without erasing stored values', () => {
    const existing = new Map<string, StoredPostcode>([
      ['12000', { code: '12000', city: 'Praha 2', district: 'Praha', deliveryBlocked: false }],
      ['39999', { code: '39999', city: 'Obec', district: null, deliveryBlocked: true }],
    ])
    const rows = parsePostcodeCsv(
      'psc;obec;okres\n12000;Praha 2;Praha\n39999;Obec nová;\n60200;Brno;Brno-město',
    ).rows
    const plan = planPostcodeImport(rows, existing)
    expect(plan.unchanged).toBe(1)
    expect(plan.toCreate).toEqual([
      { code: '60200', city: 'Brno', district: 'Brno-město', deliveryBlocked: false },
    ])
    // No "nedorucujeme" column -> the stored flag is kept.
    expect(plan.toUpdate).toEqual([
      { code: '39999', city: 'Obec nová', district: null, deliveryBlocked: true },
    ])

    const createOnly = planPostcodeImport(rows, existing, { createOnly: true })
    expect(createOnly.toUpdate).toEqual([])
    expect(createOnly.unchanged).toBe(2)
  })

  it('exports a file that imports back to the same data', () => {
    const data: StoredPostcode[] = [
      { code: '12000', city: 'Praha 2', district: 'Praha', deliveryBlocked: false },
      { code: '39999', city: 'Obec; s "uvozovkami"', district: null, deliveryBlocked: true },
    ]
    const csv = buildPostcodeCsv(data)
    expect(csv.startsWith('﻿psc;obec;okres;nedorucujeme\r\n')).toBe(true)
    const back = parsePostcodeCsv(decodeCsvBytes(new TextEncoder().encode(csv)))
    expect(back.errors).toEqual([])
    expect(back.rows.map(({ line: _line, ...rest }) => rest)).toEqual(data)
  })
})
