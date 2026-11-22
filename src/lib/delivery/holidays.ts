import { addDays, type IsoDate, isoDate } from './calendar'

/**
 * Czech public holidays (státní svátky a ostatní svátky, zákon č. 245/2000 Sb.) for a year.
 *
 * Holidays are NOT blocked by the delivery engine. This list is only used to pre-fill
 * "closed" delivery exceptions, which the admin can then edit or delete (e.g. if the shop
 * decides to deliver on 1 May).
 *
 * Good Friday (Velký pátek) is a holiday since 2016; this helper follows the current law and is
 * meant for current and future years.
 */

export type Holiday = { date: IsoDate; name: string }

/** Easter Sunday (Gregorian calendar), anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return isoDate(year, month, day)
}

/** All Czech public holidays of the year, sorted by date. */
export function czechPublicHolidays(year: number): Holiday[] {
  const easter = easterSunday(year)
  const fixed = (month: number, day: number, name: string): Holiday => ({
    date: isoDate(year, month, day),
    name,
  })

  const holidays: Holiday[] = [
    fixed(1, 1, 'Den obnovy samostatného českého státu, Nový rok'),
    { date: addDays(easter, -2), name: 'Velký pátek' },
    { date: addDays(easter, 1), name: 'Velikonoční pondělí' },
    fixed(5, 1, 'Svátek práce'),
    fixed(5, 8, 'Den vítězství'),
    fixed(7, 5, 'Den slovanských věrozvěstů Cyrila a Metoděje'),
    fixed(7, 6, 'Den upálení mistra Jana Husa'),
    fixed(9, 28, 'Den české státnosti'),
    fixed(10, 28, 'Den vzniku samostatného československého státu'),
    fixed(11, 17, 'Den boje za svobodu a demokracii a Mezinárodní den studentstva'),
    fixed(12, 24, 'Štědrý den'),
    fixed(12, 25, '1. svátek vánoční'),
    fixed(12, 26, '2. svátek vánoční'),
  ]
  return holidays.sort((x, y) => x.date.localeCompare(y.date))
}
