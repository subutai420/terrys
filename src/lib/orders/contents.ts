/**
 * Stage 9 (fix from stage 7): what an order contains decides the customer wording on the
 * thank-you page and in the confirmation e-mail. An order with only a PRINTED gift voucher must
 * not say "Řezník maso naporcuje a zváží" and must not call its fixed price an estimate.
 *
 * - weighed: lines priced per kg / 100 g (meat – the butcher cuts and weighs them),
 * - printed vouchers: lines with `variantId === 'printed'` (stage 7: the chosen voucher format
 *   travels as the line's variantId),
 * - other fixed-price goods: piece-priced lines that are not vouchers (e.g. gift boxes).
 * Pure, unit-tested in `contents.test.ts`.
 */
export type OrderLineFacts = { priceUnit: string; variantId?: string | null }

export type OrderContents = {
  weighed: boolean
  printedVouchers: boolean
  otherFixed: boolean
}

export function orderContents(lines: OrderLineFacts[]): OrderContents {
  const printed = (line: OrderLineFacts) => line.variantId === 'printed'
  return {
    weighed: lines.some((line) => line.priceUnit !== 'piece'),
    printedVouchers: lines.some(printed),
    otherFixed: lines.some((line) => line.priceUnit === 'piece' && !printed(line)),
  }
}

/** Is the total an estimate (anything weighed) or a fixed amount? */
export const isEstimate = (contents: OrderContents) => contents.weighed

/** Step 1 of "Co bude dál" – how the order is prepared. */
export function preparationStep(contents: OrderContents): string {
  const { weighed, printedVouchers } = contents
  if (weighed && printedVouchers) {
    return 'Řezník maso naporcuje a zváží, dárkový poukaz přibalíme k zásilce.'
  }
  if (weighed) return 'Řezník maso naporcuje a zváží.'
  if (printedVouchers) {
    return contents.otherFixed
      ? 'Připravíme tištěný dárkový poukaz a ostatní zboží.'
      : 'Připravíme tištěný dárkový poukaz.'
  }
  return 'Objednávku pro vás připravíme.'
}

/** Step 3 – what the customer pays. */
export function paymentStep(
  contents: OrderContents,
  { withDelivery }: { withDelivery: boolean },
): string {
  const delivery = withDelivery ? ' (včetně dopravy)' : ''
  return isEstimate(contents)
    ? `Zaplatíte částku podle skutečné hmotnosti${delivery}.`
    : `Zaplatíte částku uvedenou v objednávce${delivery}.`
}
