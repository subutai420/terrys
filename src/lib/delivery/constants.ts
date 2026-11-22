/**
 * Shared constants of the delivery module (stage 2). Option values used by the Payload
 * collections and by the availability engine live here only – never duplicate them elsewhere.
 *
 * Framework-free: no Payload, no Next.js imports.
 */

/** All delivery date logic runs in this time zone, whatever the server's time zone is. */
export const SHOP_TIME_ZONE = 'Europe/Prague'

/** Provisional default for how many days ahead the cart offers dates (editable in settings). */
export const DEFAULT_HORIZON_DAYS = 21

// ---------------------------------------------------------------------------------- weekdays

/** Weekday codes in Monday-first order. Index = ISO weekday - 1. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Pondělí',
  tue: 'Úterý',
  wed: 'Středa',
  thu: 'Čtvrtek',
  fri: 'Pátek',
  sat: 'Sobota',
  sun: 'Neděle',
}

/** Short Czech names; also accepted (with or without diacritics) in the CSV import. */
export const WEEKDAY_SHORT_LABELS: Record<Weekday, string> = {
  mon: 'po',
  tue: 'út',
  wed: 'st',
  thu: 'čt',
  fri: 'pá',
  sat: 'so',
  sun: 'ne',
}

/**
 * Provisional default delivery days: Tuesday to Friday. Saturday is unconfirmed, so it is only
 * a configuration value on each shipping method, never hard-coded in the engine.
 */
export const DEFAULT_WEEKDAYS: Weekday[] = ['tue', 'wed', 'thu', 'fri']

export const WEEKDAY_OPTIONS = WEEKDAYS.map((value) => ({ value, label: WEEKDAY_LABELS[value] }))

// ---------------------------------------------------------------------------------- methods

/**
 * - `own-delivery` – Terrys' own refrigerated van,
 * - `courier`      – parcel courier through Balíkobot (carrier is configuration, today PPL),
 * - `pickup`       – personal pickup at a `locations` document (shop Italská 17, Slivínko).
 */
export const SHIPPING_METHOD_TYPES = ['own-delivery', 'courier', 'pickup'] as const
export type ShippingMethodType = (typeof SHIPPING_METHOD_TYPES)[number]

export const SHIPPING_METHOD_TYPE_LABELS: Record<ShippingMethodType, string> = {
  'own-delivery': 'Rozvoz vlastním chladicím vozem',
  courier: 'Kurýr přes Balíkobot (např. PPL)',
  pickup: 'Osobní odběr',
}

export const isDeliveryType = (type: ShippingMethodType): boolean => type !== 'pickup'

/**
 * Where a delivery method (not pickup) is offered:
 * - `zones`      – only in postcodes covered by one of its delivery zones,
 * - `everywhere` – every known Czech postcode (zones may still override the weekdays),
 * - `fallback`   – every known postcode where no OTHER delivery method has a zone
 *                  ("PPL wherever our van does not go").
 * Pickup ignores coverage: it is offered for every valid postcode.
 */
export const COVERAGE_MODES = ['zones', 'everywhere', 'fallback'] as const
export type CoverageMode = (typeof COVERAGE_MODES)[number]

export const COVERAGE_LABELS: Record<CoverageMode, string> = {
  zones: 'Jen v rozvozových oblastech (PSČ přiřazená v oblastech)',
  everywhere: 'Všechna PSČ v ČR',
  fallback: 'Všechna PSČ, kam nejezdí jiný rozvoz (záložní doprava)',
}

// ---------------------------------------------------------------------------------- exceptions

/** `closed` switches days off, `open` adds an extra delivery day outside the usual weekdays. */
export const EXCEPTION_KINDS = ['closed', 'open'] as const
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number]

export const EXCEPTION_KIND_LABELS: Record<ExceptionKind, string> = {
  closed: 'Zavřeno – v tento den nedoručujeme / nevydáváme',
  open: 'Mimořádně otevřeno – navíc k běžným dnům',
}

/** `all` = every method, `method` = one shipping method, `location` = pickup at one place. */
export const EXCEPTION_SCOPES = ['all', 'method', 'location'] as const
export type ExceptionScope = (typeof EXCEPTION_SCOPES)[number]

export const EXCEPTION_SCOPE_LABELS: Record<ExceptionScope, string> = {
  all: 'Vše (všechny způsoby dopravy i odběru)',
  method: 'Jen jeden způsob dopravy',
  location: 'Jen osobní odběr na jednom místě',
}

// ---------------------------------------------------------------------------------- reasons

/** Why a shipping method cannot be chosen for the given postcode. */
export const UNAVAILABLE_REASONS = [
  'unknown-postcode',
  'postcode-blocked',
  'outside-area',
  'no-dates',
  'misconfigured',
] as const
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number]

/** Customer-facing Czech explanations (the cart may show them next to a disabled method). */
export const UNAVAILABLE_REASON_MESSAGES: Record<UnavailableReason, string> = {
  'unknown-postcode':
    'Toto PSČ neznáme, proto vám zatím můžeme nabídnout jen osobní odběr. Zkontrolujte ho, prosím.',
  'postcode-blocked': 'Na tuto adresu nedoručujeme. Můžete si objednávku vyzvednout osobně.',
  'outside-area': 'Tímto způsobem na vaše PSČ nedoručujeme.',
  'no-dates': 'V nejbližších dnech není volný termín.',
  misconfigured: 'Tento způsob dopravy je dočasně nedostupný.',
}

// ---------------------------------------------------------------------------------- postcodes

/** Czech postcodes have five digits and start with 1–7 (0, 8, 9 are Slovak). */
export const POSTCODE_REGEX = /^[1-7]\d{4}$/

/** Removes spaces (incl. non-breaking) so "120 00" becomes "12000". Does not validate. */
export function normalizePostcode(input: string): string {
  return input.replace(/[\s ]/g, '')
}

export function isValidPostcode(input: string): boolean {
  return POSTCODE_REGEX.test(normalizePostcode(input))
}

/** "12000" -> "120 00" (the usual Czech way of writing a postcode). */
export function formatPostcode(code: string): string {
  const normalized = normalizePostcode(code)
  return normalized.length === 5 ? `${normalized.slice(0, 3)} ${normalized.slice(3)}` : normalized
}
