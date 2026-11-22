/**
 * "Dnes otevřeno / zavřeno" for store pages, from the opening hours of a location
 * (`locations.openingHours`: one free-text field per weekday, e.g. "9:30–17:30").
 *
 * Rules:
 * - Nothing is shown unless at least one weekday is filled in (we never guess opening hours).
 * - An empty weekday next to filled ones = closed that day.
 * - Recognised formats: "9:30–17:30", "9.30 - 17.30", "9–17", several ranges "9–12, 13–17".
 *   Anything else (e.g. "po domluvě") is shown as text, without an open/closed verdict.
 * - Values starting with "DOPLNIT" (seed placeholders) count as empty.
 * - The time is always Prague time (Intl, Europe/Prague), independent of the server time zone.
 *
 * Note: holidays and exceptions are not considered here (the `note` field explains them).
 * Pure module, unit-tested in `openingHours.test.ts`.
 */

export const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  monday: 'Pondělí',
  tuesday: 'Úterý',
  wednesday: 'Středa',
  thursday: 'Čtvrtek',
  friday: 'Pátek',
  saturday: 'Sobota',
  sunday: 'Neděle',
}

export type OpeningHoursInput = Partial<Record<WeekdayKey, string | null>> & {
  note?: string | null
}

/** Seed/admin placeholder for unknown facts; never shown to customers. */
export function isPlaceholder(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\s*DOPLNIT\b/i.test(value)
}

/** Trimmed text, or null for empty values and placeholders. */
export function publicText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || isPlaceholder(trimmed)) return null
  return trimmed
}

type Range = { from: number; to: number }

/** Parses "9:30–17:30, 18–20" into minutes since midnight. Null when not recognised. */
export function parseRanges(text: string): Range[] | null {
  const parts = text
    .split(/[,;]|\s+a\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const ranges: Range[] = []
  for (const part of parts) {
    const match = part.match(
      /^(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|—|až)\s*(\d{1,2})(?:[:.](\d{2}))?$/,
    )
    if (!match) return null
    const from = Number(match[1]) * 60 + Number(match[2] ?? 0)
    const to = Number(match[3]) * 60 + Number(match[4] ?? 0)
    if (from >= to || to > 24 * 60) return null
    ranges.push({ from, to })
  }
  return ranges
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Prague weekday and minutes since midnight for an instant. */
export function pragueClock(now: Date): { weekday: WeekdayKey; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekday = get('weekday').toLowerCase() as WeekdayKey
  return { weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

export type OpenStatus =
  /** No opening hours filled in at all → show nothing. */
  | { kind: 'unknown' }
  | { kind: 'open'; today: string; closesAt: string }
  | { kind: 'opens-later'; today: string; opensAt: string }
  | { kind: 'closed'; today: string | null }
  /** Today has a text we cannot interpret ("po domluvě") → show the text only. */
  | { kind: 'text'; today: string }

export function hasOpeningHours(hours: OpeningHoursInput | null | undefined): boolean {
  return WEEKDAY_KEYS.some((day) => publicText(hours?.[day]) !== null)
}

export function getOpenStatus(hours: OpeningHoursInput | null | undefined, now: Date): OpenStatus {
  if (!hours || !hasOpeningHours(hours)) return { kind: 'unknown' }
  const { weekday, minutes } = pragueClock(now)
  const today = publicText(hours[weekday])
  if (!today) return { kind: 'closed', today: null }
  const ranges = parseRanges(today)
  if (!ranges) return { kind: 'text', today }
  const current = ranges.find((r) => minutes >= r.from && minutes < r.to)
  if (current) return { kind: 'open', today, closesAt: formatMinutes(current.to) }
  const next = ranges.find((r) => minutes < r.from)
  if (next) return { kind: 'opens-later', today, opensAt: formatMinutes(next.from) }
  return { kind: 'closed', today }
}

/** Czech one-line summary of the status, or null when there is nothing to say. */
export function openStatusText(status: OpenStatus): string | null {
  switch (status.kind) {
    case 'unknown':
      return null
    case 'open':
      return `Dnes otevřeno do ${status.closesAt}`
    case 'opens-later':
      return `Dnes otevíráme v ${status.opensAt}`
    case 'closed':
      return 'Dnes zavřeno'
    case 'text':
      return `Dnes: ${status.today}`
  }
}

/** Weekly table rows for display (only when some day is filled in). */
export function weeklyRows(hours: OpeningHoursInput | null | undefined) {
  if (!hasOpeningHours(hours)) return []
  return WEEKDAY_KEYS.map((day) => ({
    day,
    label: WEEKDAY_LABELS[day],
    text: publicText(hours?.[day]) ?? 'Zavřeno',
  }))
}

/** schema.org openingHoursSpecification for the recognised days (LocalBusiness JSON-LD). */
export function openingHoursSpecification(hours: OpeningHoursInput | null | undefined) {
  const dayNames: Record<WeekdayKey, string> = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
  }
  const specs: {
    '@type': 'OpeningHoursSpecification'
    dayOfWeek: string
    opens: string
    closes: string
  }[] = []
  for (const day of WEEKDAY_KEYS) {
    const text = publicText(hours?.[day])
    const ranges = text ? parseRanges(text) : null
    for (const range of ranges ?? []) {
      const pad = (m: number) => formatMinutes(m).padStart(5, '0')
      specs.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${dayNames[day]}`,
        opens: pad(range.from),
        closes: pad(range.to),
      })
    }
  }
  return specs
}
