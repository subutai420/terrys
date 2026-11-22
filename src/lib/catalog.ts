/**
 * Shared catalog constants. Collections (admin options) and helper functions (price estimate,
 * storefront later) import the values from here, so a value is defined in exactly one place.
 *
 * The stored values are short English codes; the Czech labels are what the admin shows.
 */

/** Unit the product price refers to. Prices are always in whole or decimal CZK incl. VAT. */
export const PRICE_UNITS = ['kg', '100g', 'piece'] as const
export type PriceUnit = (typeof PRICE_UNITS)[number]

export const PRICE_UNIT_LABELS: Record<PriceUnit, string> = {
  kg: 'za 1 kg',
  '100g': 'za 100 g',
  piece: 'za kus (pevná cena)',
}

/**
 * VAT rates offered per product. Food is 12 %; some goods (e.g. gift items) may be 21 %,
 * gift vouchers 0 %. Business rule: the rate is ALWAYS a per-product setting, never global.
 * Stored as strings because Payload select options are strings; use `vatRateToNumber`.
 */
export const VAT_RATES = ['12', '21', '0'] as const
export type VatRate = (typeof VAT_RATES)[number]
export const DEFAULT_VAT_RATE: VatRate = '12'

export function vatRateToNumber(rate: VatRate | string | null | undefined): number {
  const valid = (VAT_RATES as readonly string[]).includes(rate ?? '')
  return Number(valid ? rate : DEFAULT_VAT_RATE)
}

/** Availability shown on the storefront. `hidden` = not shown to customers at all. */
export const AVAILABILITY = ['in-stock', 'in-transit', 'sold-out', 'hidden'] as const
export type Availability = (typeof AVAILABILITY)[number]

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  'in-stock': 'Skladem',
  'in-transit': 'Na cestě',
  'sold-out': 'Vyprodáno',
  hidden: 'Skryto (nezobrazovat v obchodě)',
}

/** Variant kinds: a portion cut to a target weight, or a whole/half piece of average weight. */
export const VARIANT_KINDS = ['weight', 'piece'] as const
export type VariantKind = (typeof VARIANT_KINDS)[number]
