/**
 * Stage 7 – gift vouchers ("dárkové poukazy"): shared constants. Collections, services and the
 * storefront import the values from here (one place per value, like `src/lib/catalog.ts`).
 */

/**
 * How a voucher reaches the customer. The customer picks it on the product page; it travels on the
 * cart line and the order line as the line's `variantId` (a voucher product has no real weight
 * variants, and Payload variant row ids are 24 hex characters, so these words never collide). That
 * keeps the cart identity, the item id scheme (`<productId>-electronic`) and the order snapshot
 * working without new fields.
 */
export const VOUCHER_FORMATS = ['electronic', 'printed'] as const
export type VoucherFormat = (typeof VOUCHER_FORMATS)[number]

export const VOUCHER_FORMAT_LABELS: Record<VoucherFormat, string> = {
  electronic: 'Elektronický (PDF e-mailem)',
  printed: 'Tištěný',
}

export const isVoucherFormat = (value: unknown): value is VoucherFormat =>
  typeof value === 'string' && (VOUCHER_FORMATS as readonly string[]).includes(value)

/** Values offered by the owner's spec (the product's own value is what is sold). */
export const VOUCHER_VALUES = [500, 1000, 2000, 5000] as const

/** Voucher record type: issued by this shop electronically / printed, or from the OLD shop. */
export const VOUCHER_TYPES = ['electronic', 'printed', 'legacy'] as const
export type VoucherType = (typeof VOUCHER_TYPES)[number]
export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  electronic: 'Elektronický',
  printed: 'Tištěný',
  legacy: 'Starý poukaz (starý e-shop)',
}

/**
 * Lifecycle (stored). `expired` is NOT stored by a job: a voucher past its expiry date is
 * treated as expired everywhere (`effectiveVoucherStatus`), so nothing depends on a cron.
 *
 *  issued ──(payment received)──▶ paid ──(part used)──▶ partially-redeemed ──▶ redeemed
 *     │                            │                                   ▲
 *     └──────▶ cancelled ◀─────────┘ (staff, only while nothing was redeemed)
 */
export const VOUCHER_STATUSES = [
  'issued',
  'paid',
  'partially-redeemed',
  'redeemed',
  'cancelled',
] as const
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number]
export type EffectiveVoucherStatus = VoucherStatus | 'expired'

export const VOUCHER_STATUS_LABELS: Record<EffectiveVoucherStatus, string> = {
  issued: 'Vystaven – čeká na zaplacení',
  paid: 'Zaplacen – platný',
  'partially-redeemed': 'Částečně uplatněn',
  redeemed: 'Uplatněn celý',
  cancelled: 'Zrušený',
  expired: 'Propadlý (po platnosti)',
}

/** Events in the voucher history (audit trail on the voucher record). */
export const VOUCHER_EVENTS = [
  'issued',
  'paid',
  'payment-undone',
  'redeemed',
  'redemption-changed',
  'reminder-sent',
  'cancelled',
  'note',
] as const
export type VoucherEvent = (typeof VOUCHER_EVENTS)[number]
export const VOUCHER_EVENT_LABELS: Record<VoucherEvent, string> = {
  issued: 'Vystaven',
  paid: 'Označen jako zaplacený',
  'payment-undone': 'Zaplacení vráceno zpět',
  redeemed: 'Uplatněn v objednávce',
  'redemption-changed': 'Úprava uplatnění',
  'reminder-sent': 'Připomenutí platby',
  cancelled: 'Zrušen',
  note: 'Poznámka',
}

/** Payment of an electronic voucher order (bank transfer). Goods orders are paid on delivery. */
export const PAYMENT_METHODS = ['on-delivery', 'bank-transfer'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  'on-delivery': 'Při převzetí (hotově / kartou)',
  'bank-transfer': 'Bankovním převodem předem',
}

export const PAYMENT_STATUSES = ['awaiting', 'paid', 'cancelled'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  awaiting: 'Čeká na platbu',
  paid: 'Zaplaceno',
  cancelled: 'Zrušeno (nezaplaceno)',
}

/** What happens with an electronic voucher order unpaid after the due time (setting). */
export const OVERDUE_ACTIONS = ['flag', 'flag-remind', 'flag-remind-cancel'] as const
export type OverdueAction = (typeof OVERDUE_ACTIONS)[number]
export const OVERDUE_ACTION_LABELS: Record<OverdueAction, string> = {
  flag: 'Jen označit k řešení (obsluha se ozve sama)',
  'flag-remind': 'Označit + poslat zákazníkovi jednu připomínku (doporučeno)',
  'flag-remind-cancel':
    'Označit + připomínka + po dalších dnech automaticky zrušit objednávku i poukazy',
}

export const DEFAULT_PAYMENT_DUE_HOURS = 72
