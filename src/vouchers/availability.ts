import type { Payload } from 'payload'

import { findActiveBatch } from './issue'
import { getVoucherSettings } from './settings'

export type VoucherAvailability = {
  /** Electronic vouchers can be ordered (bank account set and valid, a valid batch active). */
  electronic: boolean
  dueHours: number
  /** Admin-facing reason (never shown to customers). */
  problem: 'no-bank-account' | 'no-active-batch' | 'batch-expired' | null
}

/** Stage 7: whether electronic vouchers can be sold right now (cart, admin warnings). */
export async function electronicVoucherAvailability(
  payload: Payload,
  now = new Date(),
): Promise<VoucherAvailability> {
  const [settings, active] = await Promise.all([
    getVoucherSettings(payload),
    findActiveBatch(payload, undefined, now),
  ])
  const problem = !settings.account
    ? 'no-bank-account'
    : active.problem === 'expired'
      ? 'batch-expired'
      : active.problem
        ? 'no-active-batch'
        : null
  return { electronic: problem === null, dueHours: settings.dueHours, problem }
}
