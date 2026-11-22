import { randomBytes, randomUUID } from 'crypto'
import type { Payload } from 'payload'

import { getDeliveryOptionsForPostcode, type PublicDeliveryOptions } from '@/delivery/options'
import type { CartCheckResult } from '@/lib/orders/cartCheck'
import {
  type CheckoutInput,
  type FieldErrors,
  parseCheckoutInput,
} from '@/lib/orders/checkoutSchema'
import { TERMS_PATH } from '@/lib/orders/constants'
import { checkFormToken } from '@/lib/orders/formToken'
import { hasMarketingConsent, readCookie } from '@/lib/measurement/consent'
import { computeTotals, lineWeightGrams } from '@/lib/orders/money'
import type { Order } from '@/payload-types'

import { cartKind, MIXED_CART_MESSAGE } from '@/lib/vouchers/cart'
import { sendVoucherEmail } from '@/vouchers/emails'
import { findActiveBatch, issueVouchers, voucherSpecsForOrder } from '@/vouchers/issue'
import { getVoucherSettings } from '@/vouchers/settings'

import { checkCart } from './catalog'
import { enqueueOrderIntegrations } from '@/integrations/order'

import { sendOrderEmails } from './emails'
import { checkAddress } from './foxentry'
import { nextOrderNumber } from './orderNumber'
import { verifyTurnstile } from './turnstile'

/**
 * ORDER PLACEMENT – the server-side validation contract (also in CLAUDE.md).
 *
 * Never trusts the browser: the input carries only ids, quantities, the chosen delivery method
 * and date, customer data and consents. The server
 *  1. validates the input (zod schema shared with the browser) – 422 with Czech field messages,
 *  2. runs the bot checks: honeypot, timing token, optional Turnstile – 400,
 *  3. returns the existing order for a repeated `checkoutId` (double click, retry) – idempotent,
 *  4. re-reads products/variants with the public rules (published, not hidden, purchasable) and
 *     recomputes every price – 409 `cart-changed` with the corrected cart,
 *  5. re-runs the delivery engine NOW: the method must be available and the date still offered
 *     (the cut-off may have passed while the customer was typing) – 409 `delivery-unavailable`
 *     with fresh options,
 *  6. computes totals and VAT (`src/lib/orders/money.ts`); if the customer saw a different total,
 *     409 `prices-changed` (they confirm the new estimate),
 *  7. checks the address with Foxentry when configured (never blocks),
 *  8. saves the order (sequential number, snapshots, consents with timestamps) and only then
 *     sends the e-mails; an e-mail failure is recorded on the order, the order stays.
 */

export const FORM_TOKEN_PURPOSE = 'checkout'

export type PlaceOrderContext = {
  now?: Date
  ip?: string
  /** Integration tests skip the timing trap (they submit instantly). */
  skipBotChecks?: boolean
  /** Stage 6: request facts for Meta CAPI (consent cookie, `_fbp`/`_fbc`, user agent). */
  cookieHeader?: string | null
  userAgent?: string | null
  /** Stage 6: when to send the marketing calls (default after the response). */
  integrations?: 'after' | 'await' | 'none'
}

export type PlaceOrderErrorCode =
  | 'invalid-input'
  | 'bot'
  | 'cart-changed'
  | 'delivery-unavailable'
  | 'prices-changed'
  | 'mixed-vouchers'
  | 'vouchers-unavailable'
  | 'server-error'

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; accessToken: string; duplicate: boolean }
  | {
      ok: false
      status: number
      error: PlaceOrderErrorCode
      message: string
      fieldErrors?: FieldErrors
      cart?: CartCheckResult
      delivery?: PublicDeliveryOptions
      totalEstimate?: number
    }

const BOT_MESSAGE =
  'Objednávku se nepodařilo odeslat. Počkejte prosím chvilku a zkuste to znovu, případně nám zavolejte.'

async function findByIdempotencyKey(payload: Payload, key: string): Promise<Order | null> {
  const found = await payload.find({
    collection: 'orders',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    // accessToken has field access read: false – overrideAccess returns it.
  })
  return (found.docs[0] as Order | undefined) ?? null
}

function success(order: Order, duplicate: boolean): PlaceOrderResult {
  return {
    ok: true,
    orderNumber: order.orderNumber,
    accessToken: order.accessToken,
    duplicate,
  }
}

async function termsPageUpdatedAt(payload: Payload): Promise<string | null> {
  try {
    const result = await payload.find({
      collection: 'pages',
      where: { legacyUrl: { equals: TERMS_PATH } },
      limit: 1,
      depth: 0,
      draft: false,
      select: { updatedAt: true },
      overrideAccess: false,
    })
    return result.docs[0]?.updatedAt ?? null
  } catch {
    return null
  }
}

export async function placeOrder(
  payload: Payload,
  raw: unknown,
  context: PlaceOrderContext = {},
): Promise<PlaceOrderResult> {
  const now = context.now ?? new Date()

  // 1. Input shape (address is checked once the method type is known).
  const base = parseCheckoutInput(raw, false)
  if (!base.ok) {
    return {
      ok: false,
      status: 422,
      error: 'invalid-input',
      message: 'Zkontrolujte prosím zvýrazněné údaje.',
      fieldErrors: base.errors,
    }
  }
  const input: CheckoutInput = base.data

  // 2. Bot checks.
  if (input.website && input.website.trim() !== '') {
    payload.logger.warn('[orders] honeypot filled – submission ignored')
    return { ok: false, status: 400, error: 'bot', message: BOT_MESSAGE }
  }
  if (!context.skipBotChecks) {
    const tokenCheck = checkFormToken(
      input.formToken,
      payload.secret,
      FORM_TOKEN_PURPOSE,
      now.getTime(),
    )
    if (tokenCheck !== 'ok') {
      payload.logger.warn(`[orders] form token ${tokenCheck}`)
      return {
        ok: false,
        status: 400,
        error: 'bot',
        message:
          tokenCheck === 'expired'
            ? 'Stránka byla otevřená příliš dlouho. Obnovte ji prosím (údaje zůstanou vyplněné) a odešlete objednávku znovu.'
            : BOT_MESSAGE,
      }
    }
    if (!(await verifyTurnstile(input.turnstileToken, context.ip ?? 'unknown'))) {
      return {
        ok: false,
        status: 400,
        error: 'bot',
        message: 'Nepodařilo se ověřit, že nejste robot. Zkuste to prosím znovu.',
      }
    }
  }

  // 3. Idempotency.
  const existing = await findByIdempotencyKey(payload, input.checkoutId)
  if (existing) return success(existing, true)

  // 4. Products and prices from the database.
  const cart = await checkCart(payload, input.lines)
  if (cart.problems.length > 0 || cart.lines.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'cart-changed',
      message:
        'Některé zboží v košíku se mezitím změnilo nebo vyprodalo. Košík jsme upravili – zkontrolujte ho prosím.',
      cart,
    }
  }

  // Stage 7: which flow? Electronic vouchers never mix with goods; voucher-only = own flow.
  const flow = cartKind(cart.lines)
  if (flow === 'mixed-electronic') {
    return { ok: false, status: 409, error: 'mixed-vouchers', message: MIXED_CART_MESSAGE, cart }
  }
  if (flow === 'electronic-vouchers') {
    return placeVoucherOrder(payload, input, cart, now, context)
  }
  if (!input.delivery) {
    return {
      ok: false,
      status: 422,
      error: 'invalid-input',
      message: 'Vyberte prosím způsob dopravy a termín.',
      fieldErrors: { 'delivery.methodId': 'Vyberte způsob dopravy a termín (v košíku).' },
    }
  }
  const delivery = input.delivery

  // 5. Delivery: re-run the engine now (cut-off!).
  const options = await getDeliveryOptionsForPostcode(payload, delivery.postcode, { now })
  if (!options.ok) {
    return {
      ok: false,
      status: 422,
      error: 'invalid-input',
      message: options.message,
      fieldErrors: { 'delivery.postcode': options.message },
    }
  }
  const method = options.data.methods.find((item) => item.id === delivery.methodId)
  if (!method || !method.available || !method.dates.includes(delivery.date)) {
    return {
      ok: false,
      status: 409,
      error: 'delivery-unavailable',
      message: method?.available
        ? 'Zvolený termín už není k dispozici – mezitím uplynula uzávěrka objednávek nebo se termín obsadil. Vyberte prosím jiný den.'
        : 'Zvolený způsob dopravy už pro vaše PSČ není k dispozici. Vyberte prosím jiný.',
      delivery: options.data,
    }
  }

  // Address (delivery methods only), now that the type is known.
  const needsAddress = method.type !== 'pickup'
  const full = parseCheckoutInput(raw, needsAddress)
  if (!full.ok) {
    return {
      ok: false,
      status: 422,
      error: 'invalid-input',
      message: 'Zkontrolujte prosím doručovací adresu.',
      fieldErrors: full.errors,
    }
  }
  const address = full.address

  // 6. Totals.
  const totals = computeTotals(
    cart.lines.map((line) => ({
      unitPrice: line.unitPrice,
      priceUnit: line.priceUnit,
      weightGrams: line.weightGrams,
      quantity: line.quantity,
      vatRate: line.vatRate,
    })),
    method.price,
  )
  if (input.expectedTotal !== undefined && input.expectedTotal !== totals.totalEstimate) {
    return {
      ok: false,
      status: 409,
      error: 'prices-changed',
      message:
        'Odhad ceny se mezitím změnil (upravili jsme ceny v e-shopu). Zkontrolujte prosím nový odhad a odešlete objednávku znovu.',
      cart,
      totalEstimate: totals.totalEstimate,
    }
  }

  // 7. Address check (optional, never blocking).
  const addressCheck = address ? await checkAddress(address) : null

  // 8. Save.
  const [orderNumber, termsUpdatedAt] = await Promise.all([
    nextOrderNumber(payload),
    termsPageUpdatedAt(payload),
  ])
  const accessToken = randomBytes(24).toString('base64url')
  const timestamp = now.toISOString()
  const { customer } = input
  const location = method.pickupLocation

  let order: Order
  try {
    order = (await payload.create({
      collection: 'orders',
      overrideAccess: true,
      depth: 0,
      context: { disableRevalidate: true },
      data: {
        orderNumber,
        status: 'received',
        kind: 'goods',
        customerName: `${customer.firstName} ${customer.lastName}`,
        contactEmail: customer.email,
        contactPhone: customer.phone,
        scheduledDate: delivery.date,
        shippingLabel: method.name,
        totalEstimate: totals.totalEstimate,
        lines: cart.lines.map((line) => ({
          product: line.productId,
          productTitle: line.title,
          variantId: line.variantId,
          variantLabel: line.variantLabel,
          sku: line.sku,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          priceUnit: line.priceUnit,
          vatRate: line.vatRate as '12' | '21' | '0',
          estimatedWeightGrams: line.weightGrams,
          estimatedPrice: line.lineEstimate,
        })),
        totals: {
          goodsEstimate: totals.goodsEstimate,
          deliveryPrice: totals.deliveryPrice,
          totalEstimate: totals.totalEstimate,
          vat: totals.vat,
        },
        voucherCode: input.voucherCode ?? null,
        voucherDetails: input.voucherDetails ?? {},
        payment: { method: 'on-delivery' },
        customer: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          companyName: customer.companyName ?? null,
          ico: customer.ico ?? null,
          dic: customer.dic ?? null,
        },
        shippingAddress: address
          ? {
              street: address.street,
              city: address.city,
              postcode: address.postcode,
              checkStatus: addressCheck?.status ?? 'skipped',
              checkNote: addressCheck?.note ?? null,
            }
          : {},
        delivery: {
          method: method.id,
          methodSlug: method.slug,
          methodName: method.name,
          methodType: method.type,
          price: method.price,
          date: delivery.date,
          postcode: delivery.postcode,
          pickupLocation: location
            ? {
                name: location.name,
                street: location.street,
                city: location.city,
                zip: location.zip,
                openingHoursNote: location.openingHoursNote,
              }
            : {},
        },
        customerNote: input.note ?? null,
        consents: {
          termsAcceptedAt: timestamp,
          termsPageUpdatedAt: termsUpdatedAt,
          privacyNoticeAt: timestamp,
          newsletter: input.consents.newsletter,
          newsletterAt: input.consents.newsletter ? timestamp : null,
          heurekaOptOut: input.consents.heurekaOptOut,
        },
        attribution: input.attribution ?? {},
        eventId: randomUUID(),
        emails: { customerStatus: 'pending', shopStatus: 'pending' },
        accessToken,
        idempotencyKey: input.checkoutId,
      },
    })) as Order
  } catch (error) {
    // A parallel request with the same checkoutId won the race (unique idempotencyKey).
    const winner = await findByIdempotencyKey(payload, input.checkoutId)
    if (winner) return success(winner, true)
    payload.logger.error(`[orders] could not save order: ${String(error)}`)
    return {
      ok: false,
      status: 500,
      error: 'server-error',
      message:
        'Objednávku se nepodařilo uložit. Zkuste to prosím znovu, nebo nám zavolejte – omlouváme se.',
    }
  }

  // E-mails after the order is safely stored (failures are recorded on the order).
  await sendOrderEmails(payload, order, accessToken)

  // Stage 6: Meta CAPI / Heureka / Ecomail – queued, sent after the response; never blocks.
  try {
    const cookies = context.cookieHeader ?? null
    const marketingConsent = hasMarketingConsent(cookies)
    await enqueueOrderIntegrations(payload, order, {
      marketingConsent,
      ip: marketingConsent && context.ip && context.ip !== 'unknown' ? context.ip : null,
      userAgent: marketingConsent ? (context.userAgent ?? null) : null,
      fbp: marketingConsent ? readCookie(cookies, '_fbp') : null,
      fbc: marketingConsent ? readCookie(cookies, '_fbc') : null,
      mode: context.integrations,
    })
  } catch (error) {
    payload.logger.error(`[orders] marketing integrations not queued: ${String(error)}`)
  }

  return { ok: true, orderNumber: order.orderNumber, accessToken, duplicate: false }
}

const VOUCHERS_UNAVAILABLE_MESSAGE =
  'Elektronické poukazy teď bohužel nejde objednat online. Zkuste to prosím později, kupte ' +
  'tištěný poukaz, nebo nám zavolejte – rádi ho připravíme.'

/**
 * Stage 7: an order with ONLY electronic vouchers. No postcode, no delivery, no date, no
 * shipping price. Paid by bank transfer in advance (variable symbol = order number, due in
 * `paymentDueHours`); the vouchers are issued from the active batch and e-mailed immediately with
 * the PDF and a QR payment code (`src/vouchers`). Refused (409, no order saved) when the bank
 * account is missing/invalid or no valid batch is active – never an e-mail without payment
 * details, never a voucher without an expiry date.
 */
async function placeVoucherOrder(
  payload: Payload,
  input: CheckoutInput,
  cart: CartCheckResult,
  now: Date,
  context: PlaceOrderContext,
): Promise<PlaceOrderResult> {
  const settings = await getVoucherSettings(payload)
  const { batch, problem } = await findActiveBatch(payload, undefined, now)
  if (!settings.account || !batch) {
    payload.logger.error(
      `[vouchers] electronic voucher order refused: ${!settings.account ? 'no valid bank account in settings' : `no active batch (${problem})`}`,
    )
    return {
      ok: false,
      status: 409,
      error: 'vouchers-unavailable',
      message: VOUCHERS_UNAVAILABLE_MESSAGE,
    }
  }

  const totals = computeTotals(
    cart.lines.map((line) => ({
      unitPrice: line.unitPrice,
      priceUnit: line.priceUnit,
      weightGrams: line.weightGrams,
      quantity: line.quantity,
      vatRate: line.vatRate,
    })),
    0,
  )
  if (input.expectedTotal !== undefined && input.expectedTotal !== totals.totalEstimate) {
    return {
      ok: false,
      status: 409,
      error: 'prices-changed',
      message: 'Cena se mezitím změnila. Zkontrolujte ji prosím a odešlete objednávku znovu.',
      cart,
      totalEstimate: totals.totalEstimate,
    }
  }

  const [orderNumber, termsUpdatedAt] = await Promise.all([
    nextOrderNumber(payload),
    termsPageUpdatedAt(payload),
  ])
  const accessToken = randomBytes(24).toString('base64url')
  const timestamp = now.toISOString()
  const { customer } = input
  const dueAt = new Date(now.getTime() + settings.dueHours * 3_600_000).toISOString()

  let order: Order
  try {
    order = (await payload.create({
      collection: 'orders',
      overrideAccess: true,
      depth: 0,
      context: { disableRevalidate: true },
      data: {
        orderNumber,
        status: 'received',
        kind: 'voucher',
        customerName: `${customer.firstName} ${customer.lastName}`,
        contactEmail: customer.email,
        contactPhone: customer.phone,
        scheduledDate: null,
        shippingLabel: 'Elektronický poukaz (e-mailem)',
        totalEstimate: totals.totalEstimate,
        amountDue: totals.totalEstimate,
        lines: cart.lines.map((line) => ({
          product: line.productId,
          productTitle: line.title,
          variantId: line.variantId,
          variantLabel: line.variantLabel,
          sku: line.sku,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          priceUnit: line.priceUnit,
          vatRate: line.vatRate as '12' | '21' | '0',
          estimatedWeightGrams: null,
          estimatedPrice: line.lineEstimate,
          resolution: 'piece',
          finalPrice: line.lineEstimate,
        })),
        totals: {
          goodsEstimate: totals.goodsEstimate,
          deliveryPrice: 0,
          totalEstimate: totals.totalEstimate,
          vat: totals.vat,
          // Fixed prices: nothing to weigh, the final price is known now.
          goodsFinal: totals.goodsEstimate,
          totalFinal: totals.totalEstimate,
          vatFinal: totals.vat,
          voucherTotal: 0,
          amountDue: totals.totalEstimate,
        },
        voucherCode: null,
        voucherDetails: input.voucherDetails ?? {},
        payment: {
          method: 'bank-transfer',
          status: 'awaiting',
          amount: totals.totalEstimate,
          variableSymbol: orderNumber,
          account: settings.account.display,
          dueAt,
        },
        customer: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          companyName: customer.companyName ?? null,
          ico: customer.ico ?? null,
          dic: customer.dic ?? null,
        },
        shippingAddress: {},
        delivery: {},
        customerNote: input.note ?? null,
        consents: {
          termsAcceptedAt: timestamp,
          termsPageUpdatedAt: termsUpdatedAt,
          privacyNoticeAt: timestamp,
          newsletter: input.consents.newsletter,
          newsletterAt: input.consents.newsletter ? timestamp : null,
          heurekaOptOut: input.consents.heurekaOptOut,
        },
        attribution: input.attribution ?? {},
        eventId: randomUUID(),
        emails: { customerStatus: 'pending', shopStatus: 'pending' },
        accessToken,
        idempotencyKey: input.checkoutId,
      },
    })) as Order
  } catch (error) {
    const winner = await findByIdempotencyKey(payload, input.checkoutId)
    if (winner) return success(winner, true)
    payload.logger.error(`[orders] could not save voucher order: ${String(error)}`)
    return {
      ok: false,
      status: 500,
      error: 'server-error',
      message:
        'Objednávku se nepodařilo uložit. Zkuste to prosím znovu, nebo nám zavolejte – omlouváme se.',
    }
  }

  // Vouchers from the active batch (checked above). A failure here is logged and flagged for
  // staff (they can re-issue on the order screen); the customer still gets the payment details.
  try {
    await issueVouchers(payload, order, voucherSpecsForOrder(order, 'electronic'), { now })
  } catch (error) {
    payload.logger.error(`[vouchers] issuing failed for ${orderNumber}: ${String(error)}`)
    order = await payload.update({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
      depth: 0,
      context: { disableRevalidate: true },
      data: {
        needsReview: true,
        reviewReasons:
          'Poukazy se nepodařilo vystavit – zkontrolujte šarži a kontaktujte zákazníka.',
      },
    })
  }

  // The customer e-mail = vouchers (PDF) + payment details (QR); the shop gets the usual copy.
  await sendVoucherEmail(payload, order, 'voucher-issued')
  await sendOrderEmails(payload, order, accessToken, { customer: false })

  try {
    const cookies = context.cookieHeader ?? null
    const marketingConsent = hasMarketingConsent(cookies)
    await enqueueOrderIntegrations(payload, order, {
      marketingConsent,
      ip: marketingConsent && context.ip && context.ip !== 'unknown' ? context.ip : null,
      userAgent: marketingConsent ? (context.userAgent ?? null) : null,
      fbp: marketingConsent ? readCookie(cookies, '_fbp') : null,
      fbc: marketingConsent ? readCookie(cookies, '_fbc') : null,
      mode: context.integrations,
    })
  } catch (error) {
    payload.logger.error(`[orders] marketing integrations not queued: ${String(error)}`)
  }

  return { ok: true, orderNumber: order.orderNumber, accessToken, duplicate: false }
}

/** Estimated weight of all lines (grams) – used by the thank-you page and analytics. */
export function orderWeightGrams(order: Pick<Order, 'lines'>): number {
  return (order.lines ?? []).reduce(
    (sum, line) =>
      sum +
      (lineWeightGrams({
        weightGrams: line.estimatedWeightGrams ?? null,
        quantity: line.quantity,
      }) ?? 0),
    0,
  )
}
