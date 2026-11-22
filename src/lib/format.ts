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
