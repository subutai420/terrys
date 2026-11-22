import { describe, expect, it } from 'vitest'

import { czechPublicHolidays, easterSunday } from './holidays'

describe('easterSunday', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2038, '2038-04-25'], // latest possible date
    [2285, '2285-03-22'], // earliest possible date
  ])('%i -> %s', (year, expected) => {
    expect(easterSunday(year)).toBe(expected)
  })
})

describe('czechPublicHolidays', () => {
  it('lists all 13 Czech public holidays of 2026 in date order', () => {
    expect(czechPublicHolidays(2026).map((h) => h.date)).toEqual([
      '2026-01-01',
      '2026-04-03', // Velký pátek
      '2026-04-06', // Velikonoční pondělí
      '2026-05-01',
      '2026-05-08',
      '2026-07-05',
      '2026-07-06',
      '2026-09-28',
      '2026-10-28',
      '2026-11-17',
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
    ])
  })

  it('moves Easter Friday and Monday with Easter (2027)', () => {
    const holidays = czechPublicHolidays(2027)
    expect(holidays.find((h) => h.name === 'Velký pátek')?.date).toBe('2027-03-26')
    expect(holidays.find((h) => h.name === 'Velikonoční pondělí')?.date).toBe('2027-03-29')
    expect(holidays).toHaveLength(13)
  })

  it('names every holiday in Czech', () => {
    for (const holiday of czechPublicHolidays(2027)) expect(holiday.name.length).toBeGreaterThan(5)
    expect(czechPublicHolidays(2027)[0].name).toContain('Nový rok')
  })
})
