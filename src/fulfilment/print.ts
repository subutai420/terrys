import { esc, escMultiline } from '@/email/templates/layout'
import type { IsoDate } from '@/lib/delivery/calendar'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import { formatCzk, formatUnitPrice } from '@/lib/format'
import {
  LINE_RESOLUTION_LABELS,
  type LineResolution,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from '@/lib/orders/constants'
import { addressLine, formatDateLong, UNIT_LABEL } from '@/lib/orders/format'
import {
  cutList,
  estimatedLineGrams,
  formatKg,
  orderGrams,
  ordersCountText,
  type WeighLine,
} from '@/lib/orders/fulfilment'
import { formatWeight } from '@/lib/productView'
import type { PriceUnit } from '@/lib/catalog'
import type { Order } from '@/payload-types'

/**
 * Printable sheets (stage 5): production sheet + cut list, packing slip, route sheet for the
 * driver. Plain HTML strings with print CSS for A4 (same escaping helper as the e-mails), served
 * by `GET /api/fulfilment/print/*` to logged-in staff. Pure: orders in, HTML out.
 */

const CSS = `
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; padding: 16px; }
h1 { font-size: 18pt; margin: 0 0 4px; }
h2 { font-size: 13pt; margin: 18px 0 6px; border-bottom: 2px solid #111; padding-bottom: 2px; }
.meta { color: #555; font-size: 9pt; margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eee; font-size: 9pt; text-transform: uppercase; }
td.num, th.num { text-align: right; white-space: nowrap; }
.order { border: 2px solid #111; padding: 8px 10px; margin: 0 0 12px; page-break-inside: avoid; break-inside: avoid; }
.order-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; }
.order-no { font-size: 16pt; font-weight: 700; }
.note { border: 2px dashed #111; padding: 6px 8px; margin: 6px 0; font-weight: 600; background: #f7f7f7; }
.tag { display: inline-block; border: 1px solid #111; border-radius: 3px; padding: 0 5px; font-size: 9pt; margin-left: 6px; }
.write { min-width: 70px; }
.slip { page-break-after: always; break-after: page; }
.slip:last-child { page-break-after: auto; break-after: auto; }
.total { font-size: 14pt; font-weight: 700; }
.toolbar { position: sticky; top: 0; background: #fff8e1; border: 1px solid #e0c060; padding: 8px 12px; margin: -16px -16px 16px; display: flex; gap: 12px; align-items: center; }
.toolbar button { font-size: 12pt; padding: 6px 16px; cursor: pointer; }
.sim { color: #b00004; font-weight: 700; }
.empty { padding: 24px; text-align: center; color: #555; border: 1px dashed #999; }
@media print { .toolbar { display: none; } body { padding: 0; } }
`

function documentHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head>
<body><div class="toolbar"><button type="button" onclick="window.print()">Vytisknout</button><span>${esc(title)}</span><a href="javascript:history.back()">← zpět</a></div>
${body}</body></html>`
}

const lineName = (line: { productTitle: string; variantLabel?: string | null }) => line.productTitle
const generated = (now: Date) =>
  `Vytištěno ${now.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}`
const TYPE_SHORT: Record<ShippingMethodType, string> = {
  'own-delivery': 'ROZVOZ',
  courier: 'KURÝR',
  pickup: 'ODBĚR',
}
const typeLabel = (order: Order) =>
  TYPE_SHORT[(order.delivery?.methodType ?? 'pickup') as ShippingMethodType] ?? ''
const weighLines = (order: Order) =>
  (order.lines ?? []).map((l) => ({ ...l, priceUnit: l.priceUnit as PriceUnit })) as WeighLine[]

/** Production sheet for a date: cut list summary + every order with its items. */
export function productionSheetHtml(date: IsoDate, orders: Order[], now = new Date()): string {
  const title = `Výrobní list – ${formatDateLong(date)}`
  const rows = cutList(
    orders.map((o) => ({
      orderNumber: o.orderNumber,
      lines: weighLines(o).filter((l) => l.resolution !== 'unavailable'),
    })),
  )
  const totalGrams = orders.reduce((sum, o) => sum + orderGrams(weighLines(o)), 0)
  const cut = rows.length
    ? `<table><thead><tr><th>Produkt</th><th>Varianta</th><th class="num">Kusů</th><th class="num">Cíl celkem</th><th>Objednávky</th><th class="write">Hotovo</th></tr></thead><tbody>
${rows
  .map(
    (r) =>
      `<tr><td><strong>${esc(r.productTitle)}</strong></td><td>${esc(r.variantLabel ?? '')}</td><td class="num">${r.pieces}</td><td class="num">${r.totalGrams === null ? 'kusy' : esc(formatWeight(r.totalGrams))}</td><td>${esc(r.orders.join(', '))}</td><td></td></tr>`,
  )
  .join('\n')}</tbody></table>`
    : '<div class="empty">Na tento den nejsou žádné objednávky.</div>'

  const blocks = orders
    .map((order) => {
      const lines = weighLines(order)
      return `<div class="order">
<div class="order-head"><span class="order-no">č. ${esc(order.orderNumber)}</span><span>${esc(order.customerName ?? '')}</span><span>${esc(order.delivery?.methodName ?? '')}<span class="tag">${esc(typeLabel(order))}</span></span><span>${esc(ORDER_STATUS_LABELS[order.status as OrderStatus])}</span></div>
${order.customerNote ? `<div class="note">Poznámka zákazníka: ${escMultiline(order.customerNote)}</div>` : ''}
<table><thead><tr><th>Produkt</th><th>Varianta</th><th class="num">Počet</th><th class="num">Cíl / ks</th><th class="num">Cíl celkem</th><th class="num write">Skutečně (g)</th></tr></thead><tbody>
${lines
  .map((line) => {
    const target = estimatedLineGrams(line)
    const actual =
      line.resolution === 'unavailable'
        ? 'není'
        : line.priceUnit === 'piece'
          ? 'kus'
          : line.actualWeightGrams
            ? String(line.actualWeightGrams)
            : ''
    return `<tr><td><strong>${esc(lineName(line))}</strong></td><td>${esc(line.variantLabel ?? '')}</td><td class="num">${line.quantity}×</td><td class="num">${line.estimatedWeightGrams ? esc(formatWeight(line.estimatedWeightGrams)) : '–'}</td><td class="num">${target ? esc(formatWeight(target)) : '–'}</td><td class="num">${esc(actual)}</td></tr>`
  })
  .join('\n')}
</tbody></table></div>`
    })
    .join('\n')

  return documentHtml(
    title,
    `<h1>${esc(title)}</h1><div class="meta">${ordersCountText(orders.length)} · odhad ${esc(formatKg(totalGrams))} · ${esc(generated(now))}</div>
<h2>Co připravit (součet za den)</h2>${cut}
${orders.length ? `<h2>Objednávky</h2>${blocks}` : ''}`,
  )
}

/** Packing slip(s): one page per order with weights, final prices and the amount to collect. */
export function packingSlipsHtml(orders: Order[], now = new Date()): string {
  const title =
    orders.length === 1
      ? `Balicí list – objednávka č. ${orders[0].orderNumber}`
      : `Balicí listy (${orders.length})`
  const slips = orders
    .map((order) => {
      const weighed = order.totals?.totalFinal !== null && order.totals?.totalFinal !== undefined
      const pickup = order.delivery?.methodType === 'pickup'
      const lines = (order.lines ?? [])
        .map((line) => {
          const resolution = line.resolution as LineResolution | null
          const weight =
            resolution === 'unavailable'
              ? LINE_RESOLUTION_LABELS.unavailable
              : line.priceUnit === 'piece'
                ? '–'
                : line.actualWeightGrams
                  ? formatWeight(line.actualWeightGrams)
                  : `odhad ${formatWeight((line.estimatedWeightGrams ?? 0) * line.quantity)}`
          const price = weighed
            ? formatCzk(line.finalPrice ?? 0)
            : `≈ ${formatCzk(line.estimatedPrice)}`
          return `<tr><td><strong>${esc(line.productTitle)}</strong>${line.variantLabel ? ` – ${esc(line.variantLabel)}` : ''}${line.weighNote ? `<br><small>${esc(line.weighNote)}</small>` : ''}</td><td class="num">${line.quantity}×</td><td class="num">${esc(formatUnitPrice(line.unitPrice))} / ${esc(UNIT_LABEL[line.priceUnit as PriceUnit])}</td><td class="num">${esc(weight)}</td><td class="num">${esc(price)}</td></tr>`
        })
        .join('\n')
      const vouchers = (order.voucherRedemptions ?? [])
        .map(
          (v) =>
            `<tr><td colspan="4" class="num">Uhrazeno poukazem ${esc(v.code)}</td><td class="num">−${esc(formatCzk(v.amount))}</td></tr>`,
        )
        .join('')
      return `<div class="slip">
<h1>Terrys Steak – objednávka č. ${esc(order.orderNumber)}</h1>
<div class="meta">${esc(order.delivery?.methodName ?? '')} · ${order.delivery?.date ? esc(formatDateLong(order.delivery.date)) : ''}${order.invoiceNumber ? ` · faktura ${esc(order.invoiceNumber)}` : ''} · ${esc(generated(now))}</div>
<table><tbody>
<tr><th>Zákazník</th><td>${esc(order.customerName ?? '')}${order.customer?.companyName ? `, ${esc(order.customer.companyName)}` : ''}<br>${esc(order.contactPhone ?? '')} · ${esc(order.contactEmail ?? '')}</td></tr>
<tr><th>${pickup ? 'Vyzvednutí' : 'Adresa'}</th><td>${pickup ? esc(`${order.delivery?.pickupLocation?.name ?? ''}, ${addressLine(order.delivery?.pickupLocation ?? {})}`) : esc(addressLine(order.shippingAddress ?? {}))}</td></tr>
</tbody></table>
${order.customerNote ? `<div class="note">Poznámka: ${escMultiline(order.customerNote)}</div>` : ''}
<h2>Položky</h2>
<table><thead><tr><th>Zboží</th><th class="num">Počet</th><th class="num">Cena za jednotku</th><th class="num">Hmotnost</th><th class="num">Cena</th></tr></thead><tbody>
${lines}
<tr><td colspan="4" class="num">Zboží celkem</td><td class="num">${weighed ? esc(formatCzk(order.totals.goodsFinal ?? 0)) : `≈ ${esc(formatCzk(order.totals.goodsEstimate))}`}</td></tr>
<tr><td colspan="4" class="num">Doprava</td><td class="num">${order.totals.deliveryPrice ? esc(formatCzk(order.totals.deliveryPrice)) : 'zdarma'}</td></tr>
<tr><td colspan="4" class="num"><strong>Celkem vč. DPH</strong></td><td class="num"><strong>${weighed ? esc(formatCzk(order.totals.totalFinal ?? 0)) : `≈ ${esc(formatCzk(order.totals.totalEstimate))}`}</strong></td></tr>
${vouchers}
</tbody></table>
<p class="total">K úhradě při převzetí: ${weighed ? esc(formatCzk(order.totals.amountDue ?? order.totals.totalFinal ?? 0)) : 'ještě nezváženo'}</p>
${weighed ? '' : '<p class="sim">Objednávka ještě není zvážená – ceny jsou odhad.</p>'}
<p style="margin-top:40px">Zboží převzal(a): ______________________________</p>
</div>`
    })
    .join('\n')
  return documentHtml(title, slips || '<div class="empty">Žádné objednávky.</div>')
}

/** Route sheet for the driver (own van) + list of pickups for a date. */
export function routeSheetHtml(date: IsoDate, orders: Order[], now = new Date()): string {
  const title = `Rozvoz a výdej – ${formatDateLong(date)}`
  const van = orders.filter((o) => o.delivery?.methodType === 'own-delivery')
  const pickups = orders.filter((o) => o.delivery?.methodType === 'pickup')
  const due = (o: Order) => o.totals?.amountDue ?? o.totals?.totalFinal ?? null
  const dueText = (o: Order) => (due(o) === null ? 'nezváženo' : formatCzk(due(o)!))
  const sum = (list: Order[]) => list.reduce((s, o) => s + (due(o) ?? 0), 0)
  const table = (list: Order[], pickup: boolean) =>
    list.length
      ? `<table><thead><tr><th>#</th><th>Obj.</th><th>Zákazník, telefon</th><th>${pickup ? 'Místo' : 'Adresa'}</th><th class="num">Vybrat</th><th>Poznámka</th><th class="write">Podpis / ✓</th></tr></thead><tbody>
${list
  .map(
    (o, i) =>
      `<tr><td>${i + 1}</td><td><strong>${esc(o.orderNumber)}</strong></td><td>${esc(o.customerName ?? '')}<br><strong>${esc(o.contactPhone ?? '')}</strong></td><td>${pickup ? esc(o.delivery?.pickupLocation?.name ?? '') : esc(addressLine(o.shippingAddress ?? {}))}</td><td class="num"><strong>${esc(dueText(o))}</strong></td><td>${o.customerNote ? escMultiline(o.customerNote) : ''}</td><td></td></tr>`,
  )
  .join('\n')}
<tr><td colspan="4" class="num">Celkem vybrat</td><td class="num"><strong>${esc(formatCzk(sum(list)))}</strong></td><td colspan="2"></td></tr>
</tbody></table>`
      : '<div class="empty">Nic.</div>'
  return documentHtml(
    title,
    `<h1>${esc(title)}</h1><div class="meta">${esc(generated(now))}</div>
<h2>Rozvoz vlastním vozem (${van.length})</h2>${table(van, false)}
<h2>Osobní odběr (${pickups.length})</h2>${table(pickups, true)}`,
  )
}

/** Simple HTML error page for the print endpoints. */
export function printErrorHtml(message: string): string {
  return documentHtml('Chyba', `<div class="empty">${esc(message)}</div>`)
}
