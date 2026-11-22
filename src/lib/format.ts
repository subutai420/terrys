const czkFormatter = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
})

/**
 * Formats a whole-crown amount for display, e.g. 229 -> "229 Kč".
 * Note: Czech formatting uses non-breaking spaces between digit groups and before "Kč".
 */
export function formatCzk(amount: number): string {
  return czkFormatter.format(amount)
}

const czkDecimalFormatter = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Unit price (per kg / 100 g / piece), which may have haléře: 27.9 -> "27,90 Kč", 990 -> "990 Kč".
 * Stage 4: used in the cart, checkout, thank-you page and e-mails.
 */
export function formatUnitPrice(amount: number): string {
  return Number.isInteger(amount) ? formatCzk(amount) : czkDecimalFormatter.format(amount)
}
