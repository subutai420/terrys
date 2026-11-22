import type { PriceUnit } from '../catalog'
import { DEFAULT_WEIGHT_TOLERANCE_PERCENT, type LineResolution } from './constants'
import { lineFinalPrice } from './money'

/**
 * Stage 5 – pure helpers of the weighing and dispatch screens (no Payload, no clock).
 * Unit tests: `fulfilment.test.ts`.
 *
 * WEIGHING MODEL (decision, see CLAUDE.md "Fulfilment"): a line with quantity > 1 is weighed as
 * ONE TOTAL weight (all pieces of the line together). The price only depends on the total
 * (unit price × weight), the tolerance compares the total with the estimated total, and the
 * butcher types one number instead of N. The weighing screen can still add up the pieces one by
 * one ("po kusech") – the single pieces are kept as a note (`pieceWeights`) for the record only.
 */

export type WeighLine = {
  id?: string | null
  productTitle: string
  variantLabel?: string | null
  quantity: number
  unitPrice: number
  priceUnit: PriceUnit
  vatRate: string
  /** Estimated weight of ONE piece. */
  estimatedWeightGrams?: number | null
  estimatedPrice: number
  actualWeightGrams?: number | null
  resolution?: LineResolution | null
  /** Why the deviation is over the tolerance (required then). */
  toleranceNote?: string | null
  /** What the replacement is / why unavailable. */
  weighNote?: string | null
}

/** Piece-priced items are never weighed. */
export function needsWeighing(line: Pick<WeighLine, 'priceUnit'>): boolean {
  return line.priceUnit !== 'piece'
}

/** Estimated weight of the whole line in grams (null when unknown). */
export function estimatedLineGrams(
  line: Pick<WeighLine, 'estimatedWeightGrams' | 'quantity'>,
): number | null {
  const w = line.estimatedWeightGrams
  return typeof w === 'number' && w > 0 ? Math.round(w * line.quantity) : null
}

/** Deviation of the actual weight from the estimate as a fraction (+0.1 = 10 % more). */
export function weightDeviation(estimatedGrams: number | null, actualGrams: number | null) {
  if (!estimatedGrams || !actualGrams || estimatedGrams <= 0 || actualGrams <= 0) return null
  return (actualGrams - estimatedGrams) / estimatedGrams
}

/**
 * True when the deviation is MORE than the tolerance (exactly 15 % is still fine).
 * Compared in whole tenths of a per cent so floating point noise never flips the result.
 */
export function isOverTolerance(
  estimatedGrams: number | null,
  actualGrams: number | null,
  tolerancePercent = DEFAULT_WEIGHT_TOLERANCE_PERCENT,
): boolean {
  const deviation = weightDeviation(estimatedGrams, actualGrams)
  if (deviation === null) return false
  return Math.round(Math.abs(deviation) * 1000) > Math.round(tolerancePercent * 10)
}

/** "+12 %" / "−3 %" for the screens. */
export function formatDeviation(deviation: number | null): string {
  if (deviation === null) return ''
  const value = Math.round(deviation * 100)
  if (value === 0) return '±0 %'
  return `${value > 0 ? '+' : '−'}${Math.abs(value)} %`
}

/** Line is over the tolerance (weighed or substituted lines only). */
export function lineOverTolerance(line: WeighLine, tolerancePercent: number): boolean {
  if (line.resolution !== 'weighed' && line.resolution !== 'substituted') return false
  return isOverTolerance(estimatedLineGrams(line), line.actualWeightGrams ?? null, tolerancePercent)
}

/** What is still missing on a line before the order can be marked weighed (Czech) or null. */
export function lineProblem(line: WeighLine, tolerancePercent: number): string | null {
  if (line.resolution === 'unavailable') return null
  if (!needsWeighing(line)) return null
  if (line.resolution !== 'weighed' && line.resolution !== 'substituted') return 'nezváženo'
  if (!line.actualWeightGrams || line.actualWeightGrams <= 0) return 'chybí hmotnost'
  if (line.resolution === 'substituted' && !line.weighNote?.trim()) {
    return 'napište, čím je zboží nahrazeno'
  }
  if (lineOverTolerance(line, tolerancePercent) && !line.toleranceNote?.trim()) {
    return 'odchylka nad limit – napište důvod'
  }
  return null
}

/** True when every line is resolved – only then can the order become "zváženo". */
export function isWeighingComplete(lines: WeighLine[], tolerancePercent: number): boolean {
  return lines.length > 0 && lines.every((line) => lineProblem(line, tolerancePercent) === null)
}

/** The order needs a staff check after weighing (over tolerance, substitution, unavailable). */
export function weighingNeedsReview(lines: WeighLine[], tolerancePercent: number): string[] {
  const reasons: string[] = []
  for (const line of lines) {
    const name = line.variantLabel
      ? `${line.productTitle} (${line.variantLabel})`
      : line.productTitle
    if (lineOverTolerance(line, tolerancePercent)) {
      const dev = formatDeviation(
        weightDeviation(estimatedLineGrams(line), line.actualWeightGrams ?? null),
      )
      reasons.push(
        `${name}: odchylka ${dev}${line.toleranceNote ? ` – ${line.toleranceNote}` : ''}`,
      )
    }
    if (line.resolution === 'substituted') {
      reasons.push(`${name}: náhrada – ${line.weighNote ?? ''}`)
    }
    if (line.resolution === 'unavailable') {
      reasons.push(`${name}: není k dispozici${line.weighNote ? ` – ${line.weighNote}` : ''}`)
    }
  }
  return reasons
}

/** Parses what the butcher typed ("1 250", "1250", "1,25 kg"?) into whole grams, or null. */
export function parseGrams(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!text) return null
  const kg = /^(\d+(?:[.,]\d+)?)kg$/.exec(text)
  if (kg) {
    const value = Math.round(Number(kg[1].replace(',', '.')) * 1000)
    return value > 0 ? value : null
  }
  const g = /^(\d+)g?$/.exec(text)
  if (!g) return null
  const value = Number(g[1])
  return value > 0 && value <= 200_000 ? value : null
}

/** Final price preview of one line (null while unresolved). */
export function linePreviewPrice(line: WeighLine): number | null {
  return lineFinalPrice({
    unitPrice: line.unitPrice,
    priceUnit: line.priceUnit,
    quantity: line.quantity,
    vatRate: line.vatRate,
    actualWeightGrams: line.actualWeightGrams,
    resolution:
      line.priceUnit === 'piece' && line.resolution !== 'unavailable' ? 'piece' : line.resolution,
  })
}

// ---------------------------------------------------------------------------------------------
// Production sheet / day overview
// ---------------------------------------------------------------------------------------------

export type CutListOrder = {
  orderNumber: string
  lines: Pick<
    WeighLine,
    'productTitle' | 'variantLabel' | 'quantity' | 'estimatedWeightGrams' | 'priceUnit'
  >[]
}

export type CutListRow = {
  productTitle: string
  variantLabel: string | null
  pieces: number
  /** Sum of the target weights (null for piece-priced items). */
  totalGrams: number | null
  orders: string[]
}

/**
 * How much of each product (and variant) to prepare for a day, across all orders. Sorted by
 * product name, then variant weight. Piece-priced items are counted in pieces only.
 */
export function cutList(orders: CutListOrder[]): CutListRow[] {
  const rows = new Map<string, CutListRow & { sortWeight: number }>()
  for (const order of orders) {
    for (const line of order.lines) {
      const key = `${line.productTitle}\u0000${line.variantLabel ?? ''}`
      const row = rows.get(key) ?? {
        productTitle: line.productTitle,
        variantLabel: line.variantLabel ?? null,
        pieces: 0,
        totalGrams: line.priceUnit === 'piece' ? null : 0,
        orders: [],
        sortWeight: line.estimatedWeightGrams ?? 0,
      }
      row.pieces += line.quantity
      const grams = estimatedLineGrams(line)
      if (row.totalGrams !== null && grams !== null) row.totalGrams += grams
      if (!row.orders.includes(order.orderNumber)) row.orders.push(order.orderNumber)
      rows.set(key, row)
    }
  }
  return [...rows.values()]
    .sort(
      (a, b) =>
        a.productTitle.localeCompare(b.productTitle, 'cs') ||
        a.sortWeight - b.sortWeight ||
        (a.variantLabel ?? '').localeCompare(b.variantLabel ?? '', 'cs'),
    )
    .map(({ sortWeight: _sortWeight, ...row }) => row)
}

/** Estimated grams of a whole order (weighed lines use the actual weight). */
export function orderGrams(lines: WeighLine[]): number {
  return lines.reduce((sum, line) => {
    if (line.resolution === 'unavailable') return sum
    const actual = line.actualWeightGrams
    if (typeof actual === 'number' && actual > 0) return sum + actual
    return sum + (estimatedLineGrams(line) ?? 0)
  }, 0)
}

/** "12,4 kg" with one decimal (day overview). */
export function formatKg(grams: number): string {
  return `${(Math.round(grams / 100) / 10).toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} kg`
}

/** "1 objednávka", "3 objednávky", "5 objednávek". */
export function ordersCountText(count: number): string {
  if (count === 1) return '1 objednávka'
  if (count >= 2 && count <= 4) return `${count} objednávky`
  return `${count} objednávek`
}
