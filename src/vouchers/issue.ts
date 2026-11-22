import type { Payload, PayloadRequest } from 'payload'

import { toShopDate } from '@/lib/delivery/calendar'
import { generateVoucherCode, normalizeVoucherCode } from '@/lib/vouchers/code'
import { ELECTRONIC_VARIANT_ID, PRINTED_VARIANT_ID } from '@/lib/vouchers/cart'
import type { Order, Voucher, VoucherBatch } from '@/payload-types'

/**
 * Issuing voucher records (stage 7).
 *
 * - Every voucher comes from the ACTIVE batch (its letter goes into the code, its expiry date onto
 *   the voucher). No active batch, or an active batch that already expired → `NoActiveBatchError`:
 *   a voucher is NEVER issued without a valid expiry date.
 * - Codes are random (`src/lib/vouchers/code.ts`); the unique index on `codeNormalized` is the
 *   real guarantee – a clash (practically impossible) is retried with a new code, so two parallel
 *   orders can never end up with the same code.
 */

export class NoActiveBatchError extends Error {
  constructor(reason: 'none' | 'expired') {
    super(
      reason === 'none'
        ? 'Není aktivní šarže poukazů (Poukazy → Šarže poukazů).'
        : 'Aktivní šarže poukazů už je po platnosti – založte novou šarži.',
    )
    this.name = 'NoActiveBatchError'
  }
}

export async function findActiveBatch(
  payload: Payload,
  req?: PayloadRequest,
  now = new Date(),
): Promise<{ batch: VoucherBatch | null; problem: 'none' | 'expired' | null }> {
  const found = await payload.find({
    collection: 'voucher-batches',
    where: { active: { equals: true } },
    sort: '-updatedAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const batch = found.docs[0] ?? null
  if (!batch) return { batch: null, problem: 'none' }
  if (toShopDate(batch.expiresOn) < toShopDate(now)) return { batch: null, problem: 'expired' }
  return { batch, problem: null }
}

type IssueSpec = {
  type: 'electronic' | 'printed'
  value: number
  recipientName?: string | null
  message?: string | null
}

/** Which vouchers an order should produce (one per piece of each voucher line). */
export function voucherSpecsForOrder(order: Order, type: 'electronic' | 'printed'): IssueSpec[] {
  const variant = type === 'electronic' ? ELECTRONIC_VARIANT_ID : PRINTED_VARIANT_ID
  const specs: IssueSpec[] = []
  for (const line of order.lines ?? []) {
    if (line.variantId !== variant) continue
    for (let i = 0; i < line.quantity; i++) {
      specs.push({
        type,
        value: line.unitPrice,
        recipientName: order.voucherDetails?.recipientName ?? null,
        message: order.voucherDetails?.message ?? null,
      })
    }
  }
  return specs
}

const isUniqueViolation = (error: unknown) => {
  const text = `${String(error)} ${JSON.stringify((error as { data?: unknown })?.data ?? '')}`
  return /unique|duplicate|codeNormalized|code_normalized/i.test(text)
}

/** Creates the voucher records; returns them in order. Throws `NoActiveBatchError`. */
export async function issueVouchers(
  payload: Payload,
  order: Order,
  specs: IssueSpec[],
  {
    req,
    userId = null,
    now = new Date(),
    random,
  }: {
    req?: PayloadRequest
    userId?: number | null
    now?: Date
    random?: (bytes: Uint8Array) => Uint8Array
  } = {},
): Promise<Voucher[]> {
  if (!specs.length) return []
  const { batch, problem } = await findActiveBatch(payload, req, now)
  if (!batch) throw new NoActiveBatchError(problem ?? 'none')

  const issued: Voucher[] = []
  for (const spec of specs) {
    let created: Voucher | null = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const code = generateVoucherCode(batch.letter, random)
      try {
        created = await payload.create({
          collection: 'vouchers',
          overrideAccess: true,
          depth: 0,
          req,
          context: { voucherService: true },
          data: {
            code,
            codeNormalized: normalizeVoucherCode(code),
            type: spec.type,
            status: 'issued',
            value: spec.value,
            balance: spec.value,
            expiresOn: batch.expiresOn,
            batch: batch.id,
            order: order.id,
            orderNumber: order.orderNumber,
            recipientName: spec.recipientName?.slice(0, 100) || null,
            message: spec.message?.slice(0, 200) || null,
            history: [
              {
                event: 'issued',
                at: now.toISOString(),
                by: userId,
                note: `Objednávka ${order.orderNumber} (${spec.type === 'electronic' ? 'elektronický' : 'tištěný'})`,
              },
            ],
          },
        })
      } catch (error) {
        // Inside a transaction a failed INSERT aborts the transaction – then retrying is
        // pointless; outside one (order placement) we simply try another code.
        if (!isUniqueViolation(error) || req?.transactionID) throw error
        payload.logger.warn(`[vouchers] code clash, retrying (${attempt + 1})`)
      }
    }
    if (!created) throw new Error('Nepodařilo se vygenerovat jedinečný kód poukazu.')
    issued.push(created)
  }
  return issued
}
