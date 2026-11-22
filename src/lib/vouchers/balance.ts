import { formatCzk } from '../format'

import { type EffectiveVoucherStatus, VOUCHER_STATUS_LABELS, type VoucherStatus } from './constants'

/**
 * Voucher balance maths (stage 7, pure, tested).
 *
 * Partial redemption IS allowed (decision): a voucher is a means of payment with a remaining
 * balance. Reason: every meat order is weighed, so the customer cannot know the final price in
 * advance and could never "hit" the voucher value exactly; forfeiting the rest would be unfair
 * and the stage 5 payment rows (code + amount ≤ order total) already work that way. The voucher
 * keeps `balance` (whole CZK, 0 ≤ balance ≤ value); redeeming lowers it, undoing a redemption
 * (staff edits the billing) returns the amount.
 *
 * Expiry: a voucher is valid on its expiry date (inclusive). Redemption checks validity on the
 * day the ORDER was placed (`orderDate`): the customer typed the code into an order before the
 * expiry, staff bill it days later – that must not make the voucher expire.
 */

export type VoucherFacts = {
  status: VoucherStatus
  value: number
  balance: number
  /** 'YYYY-MM-DD' (Prague calendar day), inclusive. */
  expiresOn: string | null
}

export function isExpired(expiresOn: string | null | undefined, today: string): boolean {
  return Boolean(expiresOn) && (expiresOn as string) < today
}

/** Stored status, or `expired` when the date passed (cancelled / fully used stay as they are). */
export function effectiveVoucherStatus(v: VoucherFacts, today: string): EffectiveVoucherStatus {
  if (v.status === 'cancelled' || v.status === 'redeemed') return v.status
  if (isExpired(v.expiresOn, today)) return 'expired'
  return v.status
}

/** Status that follows from the balance of a paid voucher. */
export function statusForBalance(value: number, balance: number): VoucherStatus {
  if (balance <= 0) return 'redeemed'
  if (balance < value) return 'partially-redeemed'
  return 'paid'
}

export type RedemptionCheck =
  | { ok: true; newBalance: number; newStatus: VoucherStatus }
  | {
      ok: false
      code: 'not-paid' | 'cancelled' | 'expired' | 'used-up' | 'insufficient' | 'invalid-amount'
      message: string
    }

/**
 * Can `amount` be paid with this voucher? `alreadyOnThisOrder` = what the same order already
 * redeemed from it (editing an existing payment row must not count it twice).
 */
export function checkRedemption(
  v: VoucherFacts,
  amount: number,
  orderDate: string,
  alreadyOnThisOrder = 0,
): RedemptionCheck {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, code: 'invalid-amount', message: 'Částka musí být celé kladné číslo v Kč.' }
  }
  if (v.status === 'issued') {
    return {
      ok: false,
      code: 'not-paid',
      message:
        'Poukaz ještě není zaplacený – platný bude, až dorazí platba (Poukazy – platby → „Zaplaceno“).',
    }
  }
  if (v.status === 'cancelled') {
    return { ok: false, code: 'cancelled', message: 'Poukaz je zrušený, nelze ho uplatnit.' }
  }
  if (isExpired(v.expiresOn, orderDate)) {
    return {
      ok: false,
      code: 'expired',
      message: `Poukaz platil do ${formatIsoDay(v.expiresOn)} – v den objednávky už byl propadlý.`,
    }
  }
  const available = v.balance + alreadyOnThisOrder
  if (available <= 0) {
    return { ok: false, code: 'used-up', message: 'Poukaz už je celý vyčerpaný.' }
  }
  if (amount > available) {
    return {
      ok: false,
      code: 'insufficient',
      message: `Na poukazu zbývá jen ${formatCzk(available)}.`,
    }
  }
  const newBalance = available - amount
  return { ok: true, newBalance, newStatus: statusForBalance(v.value, newBalance) }
}

export function formatIsoDay(iso: string | null | undefined): string {
  if (!iso) return '–'
  const [y, m, d] = iso.split('-')
  return `${Number(d)}. ${Number(m)}. ${y}`
}

export function statusLabel(status: EffectiveVoucherStatus): string {
  return VOUCHER_STATUS_LABELS[status]
}
