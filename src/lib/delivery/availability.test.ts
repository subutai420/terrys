import { afterEach, describe, expect, it } from 'vitest'

import {
  type DeliveryException,
  type DeliveryOptionsInput,
  type DeliveryZoneRule,
  getDeliveryCalendar,
  getDeliveryOptions,
  type MethodAvailability,
  type PostcodeRecord,
  type ShippingMethodRule,
} from './availability'
import { weekdayOf } from './calendar'
import { czechPublicHolidays } from './holidays'
import { parsePostcodePatterns } from './postcodePatterns'

// ------------------------------------------------------------------------------- fixtures
// Calendar reference: 2026-11-23 is a Monday. Winter time in Prague = UTC+1, summer = UTC+2.

const van: ShippingMethodRule = {
  id: 1,
  slug: 'vlastni-rozvoz',
  name: 'Rozvoz Terrys',
  type: 'own-delivery',
  active: true,
  cutoffTime: '12:00',
  leadDays: 1,
  weekdays: ['tue', 'wed', 'thu', 'fri'],
  coverage: 'zones',
  sortOrder: 10,
}
const ppl: ShippingMethodRule = {
  id: 2,
  slug: 'kuryr-ppl',
  name: 'Kurýr PPL',
  type: 'courier',
  active: true,
  cutoffTime: '14:00',
  leadDays: 1,
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  coverage: 'fallback',
  sortOrder: 20,
}
const pickupShop: ShippingMethodRule = {
  id: 3,
  slug: 'odber-italska',
  name: 'Osobní odběr Italská 17',
  type: 'pickup',
  active: true,
  cutoffTime: '12:00',
  leadDays: 1,
  weekdays: ['tue', 'wed', 'thu', 'fri'],
  coverage: 'zones',
  locationId: 10,
  sortOrder: 30,
}
const pickupSlivinko: ShippingMethodRule = {
  ...pickupShop,
  id: 4,
  slug: 'odber-slivinko',
  name: 'Osobní odběr Slivínko',
  locationId: 20,
  sortOrder: 40,
}

const zones: DeliveryZoneRule[] = [
  {
    id: 100,
    name: 'Praha',
    methodId: 1,
    active: true,
    patterns: parsePostcodePatterns('1*').patterns,
    weekdays: [],
  },
  {
    id: 101,
    name: 'Benátky nad Jizerou',
    methodId: 1,
    active: true,
    patterns: parsePostcodePatterns('294 71').patterns,
    weekdays: ['wed'],
  },
]

const postcodes: Record<string, PostcodeRecord> = {
  '12000': { code: '12000', city: 'Praha 2', deliveryBlocked: false },
  '29471': { code: '29471', city: 'Benátky nad Jizerou', deliveryBlocked: false },
  '60200': { code: '60200', city: 'Brno', deliveryBlocked: false },
  '39999': { code: '39999', city: 'Nedostupná obec', deliveryBlocked: true },
}

function input(overrides: Partial<DeliveryOptionsInput> & { now: Date }): DeliveryOptionsInput {
  const postcode = overrides.postcode ?? '12000'
  return {
    postcode,
    postcodeRecord: postcodes[postcode.replace(/\s/g, '')] ?? null,
    methods: [van, ppl, pickupShop, pickupSlivinko],
    zones,
    exceptions: [],
    horizonDays: 21,
    deliveryPrice: 229,
    ...overrides,
  }
}

function run(overrides: Partial<DeliveryOptionsInput> & { now: Date }) {
  const result = getDeliveryOptions(input(overrides))
  if (!result.ok) throw new Error('expected a valid result')
  const bySlug = (slug: string) => result.methods.find((m) => m.slug === slug) as MethodAvailability
  return { result, bySlug }
}

const closed = (
  id: number,
  dateFrom: string,
  extra: Partial<DeliveryException> = {},
): DeliveryException => ({
  id,
  kind: 'closed',
  dateFrom,
  scope: 'all',
  reason: 'Zavřeno',
  ...extra,
})

// ------------------------------------------------------------------------------- tests

describe('cut-off time', () => {
  it('offers the next allowed day when ordering before the cut-off', () => {
    // Monday 23. 11. 2026 10:00 Prague
    const { bySlug } = run({ now: new Date('2026-11-23T09:00:00Z') })
    expect(bySlug('vlastni-rozvoz').dates[0]).toBe('2026-11-24')
  })

  it('skips a day when ordering after the cut-off', () => {
    // Monday 13:00 Prague: after the van cut-off (12:00), before the PPL cut-off (14:00)
    const { bySlug } = run({ now: new Date('2026-11-23T12:00:00Z') })
    expect(bySlug('vlastni-rozvoz').dates[0]).toBe('2026-11-25')
    expect(bySlug('odber-italska').dates[0]).toBe('2026-11-25')
  })

  it('treats ordering exactly at the cut-off as late, one second before as in time', () => {
    const atCutoff = run({ now: new Date('2026-11-23T11:00:00.000Z') }) // 12:00:00 Prague
    expect(atCutoff.bySlug('vlastni-rozvoz').dates[0]).toBe('2026-11-25')

    const justBefore = run({ now: new Date('2026-11-23T10:59:59.999Z') }) // 11:59:59.999
    expect(justBefore.bySlug('vlastni-rozvoz').dates[0]).toBe('2026-11-24')
  })

  it('uses each method’s own cut-off', () => {
    // 13:00 Prague: late for the van, in time for PPL (Brno is PPL-only)
    const { bySlug } = run({ postcode: '60200', now: new Date('2026-11-23T12:00:00Z') })
    expect(bySlug('kuryr-ppl').dates[0]).toBe('2026-11-24')
  })

  it('supports a lead time of zero days (same-day pickup before the cut-off)', () => {
    const sameDay = { ...pickupShop, leadDays: 0 }
    // Tuesday 24. 11. 09:00 Prague
    const { bySlug } = run({ methods: [sameDay], now: new Date('2026-11-24T08:00:00Z') })
    expect(bySlug('odber-italska').dates[0]).toBe('2026-11-24')
  })
})

describe('weekdays', () => {
  it('skips the weekend and Monday for Tuesday–Friday methods', () => {
    // Friday 27. 11. 10:00 -> earliest Saturday -> first Tuesday 1. 12.
    const { bySlug } = run({ now: new Date('2026-11-27T09:00:00Z') })
    const vanDates = bySlug('vlastni-rozvoz').dates
    expect(vanDates[0]).toBe('2026-12-01')
    expect(vanDates.map(weekdayOf).every((d) => ['tue', 'wed', 'thu', 'fri'].includes(d))).toBe(
      true,
    )
  })

  it('returns dates up to and including today + horizon', () => {
    const { bySlug } = run({ now: new Date('2026-11-23T09:00:00Z'), horizonDays: 21 })
    const dates = bySlug('vlastni-rozvoz').dates
    expect(dates.at(-1)).toBe('2026-12-11') // 23. 11. + 21 days = Monday 14. 12.; last Fri = 11. 12.
    const short = run({ now: new Date('2026-11-23T09:00:00Z'), horizonDays: 2 })
    expect(short.bySlug('vlastni-rozvoz').dates).toEqual(['2026-11-24', '2026-11-25'])
  })

  it('gives one postcode two methods with different weekdays', () => {
    // PPL everywhere + van zone "Benátky" with Wednesdays only
    const pplEverywhere = { ...ppl, coverage: 'everywhere' as const }
    const { bySlug } = run({
      postcode: '294 71',
      methods: [van, pplEverywhere, pickupShop],
      now: new Date('2026-11-23T09:00:00Z'),
    })
    const vanResult = bySlug('vlastni-rozvoz')
    expect(vanResult.zoneName).toBe('Benátky nad Jizerou')
    expect(vanResult.weekdays).toEqual(['wed'])
    expect(vanResult.dates).toEqual(['2026-11-25', '2026-12-02', '2026-12-09'])
    expect(bySlug('kuryr-ppl').dates).toContain('2026-11-30') // a Monday
  })

  it('lets a more specific zone win over a broader one of the same method', () => {
    const broad: DeliveryZoneRule = {
      id: 102,
      name: 'Středočeský kraj',
      methodId: 1,
      active: true,
      patterns: parsePostcodePatterns('2*').patterns,
      weekdays: ['thu'],
    }
    const { bySlug } = run({
      postcode: '29471',
      zones: [broad, ...zones],
      now: new Date('2026-11-23T09:00:00Z'),
    })
    expect(bySlug('vlastni-rozvoz').zoneName).toBe('Benátky nad Jizerou')
  })

  it('adds an extra open day but a closed exception always wins', () => {
    const openSaturday: DeliveryException = {
      id: 1,
      kind: 'open',
      dateFrom: '2026-12-19',
      scope: 'method',
      methodId: 1,
      reason: 'Předvánoční sobota',
    }
    const { bySlug } = run({ exceptions: [openSaturday], now: new Date('2026-12-14T09:00:00Z') })
    expect(bySlug('vlastni-rozvoz').dates).toContain('2026-12-19')
    expect(bySlug('odber-italska').dates).not.toContain('2026-12-19')

    const both = run({
      exceptions: [openSaturday, closed(2, '2026-12-19')],
      now: new Date('2026-12-14T09:00:00Z'),
    })
    expect(both.bySlug('vlastni-rozvoz').dates).not.toContain('2026-12-19')
  })
})

describe('exceptions', () => {
  it('switches a public holiday off for every method', () => {
    const { bySlug } = run({
      exceptions: [closed(1, '2026-11-24', { reason: 'Svátek' })],
      now: new Date('2026-11-23T09:00:00Z'),
    })
    for (const slug of ['vlastni-rozvoz', 'odber-italska', 'odber-slivinko']) {
      expect(bySlug(slug).dates).not.toContain('2026-11-24')
      expect(bySlug(slug).dates[0]).toBe('2026-11-25')
    }
  })

  it('switches a day off for one method while the others stay available', () => {
    const { bySlug } = run({
      exceptions: [closed(1, '2026-11-24', { scope: 'method', methodId: 1 })],
      now: new Date('2026-11-23T09:00:00Z'),
    })
    expect(bySlug('vlastni-rozvoz').dates[0]).toBe('2026-11-25')
    expect(bySlug('odber-italska').dates[0]).toBe('2026-11-24')
  })

  it('switches pickup off at one location only', () => {
    const { bySlug } = run({
      exceptions: [closed(1, '2026-11-24', { scope: 'location', locationId: 20 })],
      now: new Date('2026-11-23T09:00:00Z'),
    })
    expect(bySlug('odber-slivinko').dates[0]).toBe('2026-11-25')
    expect(bySlug('odber-italska').dates[0]).toBe('2026-11-24')
    expect(bySlug('vlastni-rozvoz').dates[0]).toBe('2026-11-24')
  })

  it('closes a whole date range (summer closure 6.–19. 7.)', () => {
    // Thursday 1. 7. 2027 10:00 CEST
    const { bySlug } = run({
      exceptions: [
        closed(1, '2027-07-06', { dateTo: '2027-07-19', reason: 'Celozávodní dovolená' }),
      ],
      now: new Date('2027-07-01T08:00:00Z'),
      horizonDays: 30,
    })
    const dates = bySlug('vlastni-rozvoz').dates
    expect(dates.filter((d) => d >= '2027-07-06' && d <= '2027-07-19')).toEqual([])
    expect(dates).toContain('2027-07-02')
    expect(dates).toContain('2027-07-20')
  })

  it('reports a method without any date in the horizon as unavailable', () => {
    const { bySlug } = run({
      exceptions: [closed(1, '2026-11-23', { dateTo: '2027-01-31' })],
      now: new Date('2026-11-23T09:00:00Z'),
    })
    expect(bySlug('vlastni-rozvoz')).toMatchObject({ available: false, reason: 'no-dates' })
  })
})

describe('postcodes', () => {
  it('offers only pickup for a postcode marked "no delivery"', () => {
    const { result, bySlug } = run({ postcode: '39999', now: new Date('2026-11-23T09:00:00Z') })
    expect(result.deliveryBlocked).toBe(true)
    expect(bySlug('vlastni-rozvoz')).toMatchObject({ available: false, reason: 'postcode-blocked' })
    expect(bySlug('kuryr-ppl')).toMatchObject({ available: false, reason: 'postcode-blocked' })
    expect(bySlug('odber-italska').available).toBe(true)
    expect(bySlug('odber-slivinko').available).toBe(true)
  })

  it('offers only pickup for a valid but unknown postcode', () => {
    const { result, bySlug } = run({ postcode: '58001', now: new Date('2026-11-23T09:00:00Z') })
    expect(result.known).toBe(false)
    expect(bySlug('vlastni-rozvoz').reason).toBe('unknown-postcode')
    expect(bySlug('kuryr-ppl').reason).toBe('unknown-postcode')
    expect(bySlug('odber-italska').available).toBe(true)
  })

  it('rejects invalid postcodes', () => {
    for (const postcode of ['', '1200', '120000', '02000', '81101', 'abcde', '12O00']) {
      const result = getDeliveryOptions(input({ postcode, now: new Date('2026-11-23T09:00:00Z') }))
      expect(result).toEqual({ ok: false, error: 'invalid-postcode' })
    }
  })

  it('accepts a postcode written with a space', () => {
    const { result } = run({ postcode: '120 00', now: new Date('2026-11-23T09:00:00Z') })
    expect(result.postcode).toBe('12000')
    expect(result.known).toBe(true)
  })

  it('uses the fallback courier only where the van does not go', () => {
    const prague = run({ postcode: '12000', now: new Date('2026-11-23T09:00:00Z') })
    expect(prague.bySlug('vlastni-rozvoz').available).toBe(true)
    expect(prague.bySlug('kuryr-ppl').reason).toBe('outside-area')

    const brno = run({ postcode: '60200', now: new Date('2026-11-23T09:00:00Z') })
    expect(brno.bySlug('vlastni-rozvoz').reason).toBe('outside-area')
    expect(brno.bySlug('kuryr-ppl').available).toBe(true)
  })

  it('ignores inactive zones and leaves out inactive methods', () => {
    const { result } = run({
      methods: [van, { ...ppl, active: false }, pickupShop],
      zones: zones.map((z) => ({ ...z, active: false })),
      now: new Date('2026-11-23T09:00:00Z'),
    })
    expect(result.methods.map((m) => m.slug)).toEqual(['vlastni-rozvoz', 'odber-italska'])
    expect(result.methods[0].reason).toBe('outside-area')
  })
})

describe('prices and configuration', () => {
  it('charges the flat delivery price for delivery and nothing for pickup', () => {
    const { bySlug } = run({ postcode: '60200', now: new Date('2026-11-23T09:00:00Z') })
    expect(bySlug('kuryr-ppl').price).toBe(229)
    expect(bySlug('vlastni-rozvoz').price).toBe(229)
    expect(bySlug('odber-italska').price).toBe(0)
  })

  it('marks misconfigured methods (pickup without location, bad cut-off, no weekdays)', () => {
    const { result } = run({
      methods: [
        { ...pickupShop, locationId: null },
        { ...pickupSlivinko, cutoffTime: '25:00' },
        { ...van, weekdays: [] },
      ],
      now: new Date('2026-11-23T09:00:00Z'),
    })
    expect(result.methods.map((m) => m.reason)).toEqual([
      'misconfigured',
      'misconfigured',
      'misconfigured',
    ])
  })
})

describe('year boundary', () => {
  it('continues into January when ordering on 30 December', () => {
    const holidays = [...czechPublicHolidays(2026), ...czechPublicHolidays(2027)].map((h, i) =>
      closed(i, h.date, { reason: h.name }),
    )
    // Wednesday 30. 12. 2026 10:00
    const { bySlug } = run({ exceptions: holidays, now: new Date('2026-12-30T09:00:00Z') })
    expect(bySlug('vlastni-rozvoz').dates.slice(0, 4)).toEqual([
      '2026-12-31',
      '2027-01-05', // 1. 1. is a holiday, 2.–4. 1. weekend and Monday
      '2027-01-06',
      '2027-01-07',
    ])
  })
})

describe('time zone and daylight saving time', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('uses the Prague date after midnight even though it is still the previous day in UTC', () => {
    // 23. 11. 23:30 UTC = Tuesday 24. 11. 00:30 in Prague
    const { result, bySlug } = run({ now: new Date('2026-11-23T23:30:00Z') })
    expect(result.today).toBe('2026-11-24')
    expect(bySlug('vlastni-rozvoz').dates[0]).toBe('2026-11-25')
  })

  it('uses the Prague date just before midnight in summer (UTC+2)', () => {
    // 30. 6. 2027 21:59 UTC = 23:59 Prague (Wednesday) -> still 30. 6., after cut-off
    const before = run({ now: new Date('2027-06-30T21:59:00Z') })
    expect(before.result.today).toBe('2027-06-30')
    expect(before.bySlug('vlastni-rozvoz').dates[0]).toBe('2027-07-02')
    // 22:01 UTC = 00:01 on Thursday 1. 7. -> a new day, before cut-off
    const after = run({ now: new Date('2027-06-30T22:01:00Z') })
    expect(after.result.today).toBe('2027-07-01')
    expect(after.bySlug('vlastni-rozvoz').dates[0]).toBe('2027-07-02')
  })

  it('gives identical results whatever the server time zone is', () => {
    const now = new Date('2026-11-23T23:30:00Z')
    process.env.TZ = 'UTC'
    const utc = getDeliveryOptions(input({ now }))
    process.env.TZ = 'America/Los_Angeles'
    const la = getDeliveryOptions(input({ now }))
    process.env.TZ = 'Asia/Tokyo'
    const tokyo = getDeliveryOptions(input({ now }))
    expect(la).toEqual(utc)
    expect(tokyo).toEqual(utc)
  })

  it('applies the cut-off in summer time on the spring DST switch day', () => {
    // Sunday 28. 3. 2027: clocks go from 02:00 CET to 03:00 CEST. Noon CEST = 10:00 UTC.
    const pickupSunday = { ...pickupShop, weekdays: ['mon' as const, 'tue' as const] }
    const before = run({ methods: [pickupSunday], now: new Date('2027-03-28T09:59:00Z') })
    expect(before.bySlug('odber-italska').dates[0]).toBe('2027-03-29')
    const after = run({ methods: [pickupSunday], now: new Date('2027-03-28T10:00:00Z') })
    expect(after.bySlug('odber-italska').dates[0]).toBe('2027-03-30')
  })

  it('applies the cut-off in winter time on the autumn DST switch day', () => {
    // Sunday 25. 10. 2026: clocks go from 03:00 CEST back to 02:00 CET. Noon CET = 11:00 UTC.
    const pickupMonTue = { ...pickupShop, weekdays: ['mon' as const, 'tue' as const] }
    const before = run({ methods: [pickupMonTue], now: new Date('2026-10-25T10:59:00Z') })
    expect(before.bySlug('odber-italska').dates[0]).toBe('2026-10-26')
    const after = run({ methods: [pickupMonTue], now: new Date('2026-10-25T11:00:00Z') })
    expect(after.bySlug('odber-italska').dates[0]).toBe('2026-10-27')
  })

  it('lists consecutive dates across a DST switch without skipping or repeating a day', () => {
    const everyDay = {
      ...pickupShop,
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as ShippingMethodRule['weekdays'],
    }
    const { bySlug } = run({
      methods: [everyDay],
      now: new Date('2027-03-26T09:00:00Z'),
      horizonDays: 5,
    })
    expect(bySlug('odber-italska').dates).toEqual([
      '2027-03-27',
      '2027-03-28',
      '2027-03-29',
      '2027-03-30',
      '2027-03-31',
    ])
  })
})

describe('getDeliveryCalendar', () => {
  it('shows open and closed days per method with the reason', () => {
    const result = getDeliveryCalendar({
      postcode: '12000',
      postcodeRecord: postcodes['12000'],
      methods: [van, ppl, pickupShop],
      zones,
      exceptions: [closed(1, '2026-12-24', { reason: 'Štědrý den' })],
      from: '2026-12-21',
      to: '2026-12-27',
    })
    if (!result.ok) throw new Error('expected ok')
    const vanDays = result.methods[0].days
    expect(vanDays.map((d) => d.status.open)).toEqual([
      false,
      true,
      true,
      false,
      true,
      false,
      false,
    ])
    expect(vanDays[3].status).toMatchObject({ why: 'closed-exception' })
    expect(result.methods[1].reason).toBe('outside-area')
  })
})
