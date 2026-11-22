import { type IsoDate, weekdayOf } from '../delivery/calendar'
import { formatPostcode, type ShippingMethodType } from '../delivery/constants'
import type { PriceUnit } from '../catalog'
import { formatWeight } from '../productView'

/** Display helpers for the cart, checkout, thank-you page and e-mails (pure). */

const WEEKDAY_NAMES: Record<ReturnType<typeof weekdayOf>, string> = {
  mon: 'pondělí',
  tue: 'úterý',
  wed: 'středa',
  thu: 'čtvrtek',
  fri: 'pátek',
  sat: 'sobota',
  sun: 'neděle',
}
const WEEKDAY_SHORT: Record<ReturnType<typeof weekdayOf>, string> = {
  mon: 'po',
  tue: 'út',
  wed: 'st',
  thu: 'čt',
  fri: 'pá',
  sat: 'so',
  sun: 'ne',
}

/** "2026-11-24" → "úterý 24. 11. 2026" */
export function formatDateLong(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${WEEKDAY_NAMES[weekdayOf(date)]} ${d}. ${m}. ${y}`
}

/** "2026-11-24" → { weekday: "út", day: "24. 11." } (date picker chips). */
export function formatDateChip(date: IsoDate): { weekday: string; day: string } {
  const [, m, d] = date.split('-').map(Number)
  return { weekday: WEEKDAY_SHORT[weekdayOf(date)], day: `${d}. ${m}.` }
}

/** "Doručení" / "Vyzvednutí" – what the date means for the method type. */
export function dateMeaning(type: ShippingMethodType | null | undefined): string {
  return type === 'pickup' ? 'Vyzvednutí' : 'Doručení'
}

/** "990 Kč / kg" unit label. */
export const UNIT_LABEL: Record<PriceUnit, string> = { kg: 'kg', '100g': '100 g', piece: 'ks' }

/** "≈ 250 g" style weight text of a line (null for fixed-price items). */
export function weightText(weightGrams: number | null | undefined, quantity = 1): string | null {
  if (typeof weightGrams !== 'number' || weightGrams <= 0) return null
  return quantity > 1
    ? `${quantity} × ${formatWeight(weightGrams)} (≈ ${formatWeight(weightGrams * quantity)})`
    : formatWeight(weightGrams)
}

export function addressLine(address: {
  street?: string | null
  city?: string | null
  postcode?: string | null
  zip?: string | null
}): string {
  const code = address.postcode ?? address.zip
  return [
    address.street,
    [code ? formatPostcode(code) : null, address.city].filter(Boolean).join(' '),
  ]
    .filter((part) => part && String(part).trim())
    .join(', ')
}

const WEEKDAY_IN: Record<ReturnType<typeof weekdayOf>, string> = {
  mon: 'v pondělí',
  tue: 'v úterý',
  wed: 've středu',
  thu: 've čtvrtek',
  fri: 'v pátek',
  sat: 'v sobotu',
  sun: 'v neděli',
}

/** "2026-11-25" → "ve středu 25. 11. 2026" (inside a sentence: "dovezeme ve středu …"). */
export function formatDateInSentence(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${WEEKDAY_IN[weekdayOf(date)]} ${d}. ${m}. ${y}`
}
