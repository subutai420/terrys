/**
 * Which checkout flow a cart needs (stage 7, pure; used by the cart, the checkout page and the
 * server – one rule set).
 *
 * - `goods`: meat and/or PRINTED vouchers → normal flow (postcode, delivery, date, pay on
 *   delivery; the printed voucher travels with the parcel or is picked up).
 * - `electronic-vouchers`: only electronic vouchers → no postcode, no delivery, no date; bank
 *   transfer in advance with a QR code, vouchers e-mailed immediately.
 * - `mixed-electronic`: electronic vouchers together with anything else → NOT allowed.
 *
 * Why mixing is not allowed (decision): the two halves are paid differently (bank transfer now vs.
 * on delivery after weighing), so one order would need two payments, two amounts and two
 * variable symbols – confusing for the customer and for the colleague pairing payments. The old
 * shop had the same rule ("Elektronické poukazy nelze kombinovat s jiným, fyzickým, zbožím"),
 * so customers know it. The cart explains it and offers one-click fixes (switch the voucher to
 * printed, or remove it and buy it in a separate order).
 */

export type CartKind = 'empty' | 'goods' | 'electronic-vouchers' | 'mixed-electronic'

export const ELECTRONIC_VARIANT_ID = 'electronic'
export const PRINTED_VARIANT_ID = 'printed'

export const isElectronicVoucherLine = (line: { variantId: string | null }) =>
  line.variantId === ELECTRONIC_VARIANT_ID

export function cartKind(lines: { variantId: string | null }[]): CartKind {
  if (lines.length === 0) return 'empty'
  const electronic = lines.filter(isElectronicVoucherLine).length
  if (electronic === 0) return 'goods'
  return electronic === lines.length ? 'electronic-vouchers' : 'mixed-electronic'
}

export const MIXED_CART_MESSAGE =
  'Elektronický poukaz nejde koupit v jedné objednávce s masem: poukaz se platí převodem předem, ' +
  'maso při převzetí podle skutečné hmotnosti. Změňte poukaz na tištěný (přibalíme ho k zásilce), ' +
  'nebo ho odeberte a kupte zvlášť.'
