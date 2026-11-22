/**
 * Stage 9 (GDPR): pure rules of the anonymisation – what gets replaced on an order and which
 * orders may be anonymised. Unit-tested in `privacy.test.ts`; the Payload glue is
 * src/privacy/service.ts.
 *
 * Kept (accounting / tax evidence, lawyer + accountant to confirm): order number, dates, status,
 * lines (products, weights, prices, VAT), totals, vouchers redeemed (amounts), invoice number,
 * delivery method + date + postcode, company name / IČO / DIČ (invoice data of a business),
 * payment facts, status history, audit log.
 * Replaced or removed (personal data): name, e-mail, phone, street + city, customer note, the
 * gift message and recipient of a voucher, marketing attribution (utm, click ids, referrer,
 * landing page), e-mail recipients in the sent-e-mail log, carrier error texts, internal note text.
 */

/** Statuses after which nothing more happens with an order (safe to anonymise). */
export const FINAL_ORDER_STATUSES = ['delivered', 'picked-up', 'cancelled'] as const

export const ANONYMISED_LABEL = 'Anonymizováno'

export function anonymisedEmail(orderNumber: string): string {
  const safe = orderNumber.replace(/[^A-Za-z0-9-]/g, '') || 'x'
  return `anonymizovano-${safe}@anonymizovano.invalid`
}

/** Whole months between two instants (calendar-based, floor). */
export function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (to.getUTCDate() < from.getUTCDate()) months -= 1
  return months
}

export type OrderPrivacyFacts = {
  status: string
  createdAt: string
  anonymisedAt?: string | null
}

export type Eligibility = { ok: true } | { ok: false; reason: 'already' | 'active' | 'too-recent' }

export const ELIGIBILITY_MESSAGES: Record<Exclude<Eligibility, { ok: true }>['reason'], string> = {
  already: 'Už je anonymizovaná.',
  active:
    'Objednávka ještě není vyřízená (doručeno / vyzvednuto / zrušeno). Nejdřív ji dokončete nebo zrušte.',
  'too-recent': 'Objednávka je mladší než zvolená doba uchování.',
}

/**
 * May this order be anonymised now? `olderThanMonths` only for the retention run (a customer's
 * request has no age limit, but an order that is still being fulfilled is never touched).
 */
export function anonymisationEligibility(
  order: OrderPrivacyFacts,
  { now, olderThanMonths }: { now: Date; olderThanMonths?: number },
): Eligibility {
  if (order.anonymisedAt) return { ok: false, reason: 'already' }
  if (!(FINAL_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    return { ok: false, reason: 'active' }
  }
  if (
    olderThanMonths !== undefined &&
    monthsBetween(new Date(order.createdAt), now) < olderThanMonths
  ) {
    return { ok: false, reason: 'too-recent' }
  }
  return { ok: true }
}

type SentEmail = { to?: string | null; [key: string]: unknown }

/** The order fields to write (a partial update; arrays are rewritten whole). */
export function anonymisedOrderData(
  order: {
    orderNumber: string
    internalNote?: string | null
    sentEmails?: SentEmail[] | null
  },
  { now, reason, userId }: { now: Date; reason: 'request' | 'retention'; userId?: number | null },
) {
  const email = anonymisedEmail(order.orderNumber)
  return {
    customerName: ANONYMISED_LABEL,
    contactEmail: email,
    contactPhone: null,
    customer: { firstName: ANONYMISED_LABEL, lastName: ANONYMISED_LABEL, email, phone: '—' },
    shippingAddress: { street: null, city: null, checkNote: null },
    customerNote: null,
    internalNote: order.internalNote ? '[anonymizováno]' : null,
    voucherDetails: { recipientName: null, message: null },
    attribution: {
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      gclid: null,
      fbclid: null,
      referrer: null,
      landingPage: null,
      firstSeenAt: null,
    },
    shipment: { lastError: null },
    sentEmails: (order.sentEmails ?? []).map((row) => ({
      ...row,
      to: row.to ? '[anonymizováno]' : row.to,
    })),
    privacy: {
      anonymisedAt: now.toISOString(),
      anonymisedReason: reason,
      anonymisedBy: userId ?? null,
    },
  }
}

export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null
}
