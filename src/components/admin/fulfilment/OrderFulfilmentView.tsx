import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'

import type { PriceUnit } from '@/lib/catalog'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import { formatCzk, formatUnitPrice } from '@/lib/format'
import {
  EMAIL_STATUS_LABELS,
  type EmailStatus,
  SENT_EMAIL_LABELS,
  type SentEmailKind,
  type FulfilmentEmailKind,
  LINE_RESOLUTION_LABELS,
  type LineResolution,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from '@/lib/orders/constants'
import { addressLine, formatDateLong, UNIT_LABEL } from '@/lib/orders/format'
import {
  estimatedLineGrams,
  formatDeviation,
  isWeighingComplete,
  type WeighLine,
  weightDeviation,
} from '@/lib/orders/fulfilment'
import { nextStatuses } from '@/lib/orders/status'
import { formatWeight } from '@/lib/productView'
import { carrierMode } from '@/shipping/carrier'
import { getFulfilmentSettings } from '@/fulfilment/settings'
import { loadOrder } from '@/fulfilment/service'
import { PRINTED_VARIANT_ID } from '@/lib/vouchers/cart'
import { orderVouchers } from '@/vouchers/emails'

import { IssuePrintedButton } from '../vouchers/IssuePrintedButton'

import { AdminPage, idFromSegments } from './AdminPage'
import { FulfilmentClient } from './FulfilmentClient'
import { StatusPill, TypePill } from './StatusPill'

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }) : ''

/**
 * "Vyřízení objednávky" (/admin/vyrizeni/:id) for staff/admin: weighing result, final price with
 * VAT, voucher payment, amount to collect, invoice number, shipment (Balíkobot), status buttons,
 * customer e-mails and the audit trail. Butchers are sent to the weighing screen.
 */
export async function OrderFulfilmentView(props: AdminViewServerProps) {
  const { req } = props.initPageResult
  const user = req.user as { role?: string } | null
  const id = idFromSegments(props)
  // Custom views are public by default: anonymous visitors go to the login.
  if (!user) redirect(`/admin/login?redirect=${encodeURIComponent('/admin/expedice')}`)
  if (!['admin', 'staff', 'butcher'].includes(user.role ?? '')) {
    return (
      <AdminPage props={props}>
        <p>Přihlaste se.</p>
      </AdminPage>
    )
  }
  const order = id ? await loadOrder(req.payload, id, req) : null
  if (!order) {
    return (
      <AdminPage props={props}>
        <p>Objednávka nenalezena.</p>
      </AdminPage>
    )
  }
  const isEditor = user.role === 'admin' || user.role === 'staff'
  if (!isEditor) {
    return (
      <AdminPage props={props}>
        <p>Vyřízení objednávky dělá obsluha.</p>
        <a className="tf-btn tf-btn--primary" href={`/admin/vazeni/${order.id}`}>
          Přejít na vážení
        </a>
      </AdminPage>
    )
  }

  const { tolerancePercent } = await getFulfilmentSettings(req.payload, req)
  const lines = (order.lines ?? []).map((l) => ({
    ...l,
    priceUnit: l.priceUnit as PriceUnit,
    resolution: (l.resolution ?? null) as LineResolution | null,
  }))
  const weighed = isWeighingComplete(lines as WeighLine[], tolerancePercent)
  const type = order.delivery?.methodType as ShippingMethodType | undefined
  const audit = await req.payload.find({
    collection: 'order-audit-log',
    where: { order: { equals: order.id } },
    sort: '-at',
    limit: 200,
    depth: 0,
    overrideAccess: true,
    req,
  })
  // Stage 7: printed vouchers bought in this order (issued here by staff).
  const printedWanted = (order.lines ?? [])
    .filter((line) => line.variantId === PRINTED_VARIANT_ID)
    .reduce((sum, line) => sum + line.quantity, 0)
  const printed =
    printedWanted > 0
      ? (await orderVouchers(req.payload, order.id, req)).filter((v) => v.type === 'printed')
      : []
  const statuses = nextStatuses({
    from: order.status as OrderStatus,
    role: user.role as 'admin' | 'staff',
    methodType: type,
    weighingComplete: weighed,
    finalised: Boolean(order.fulfilment?.finalisedAt),
    hasTracking: Boolean(order.trackingNumber),
  }).map(({ to, result }) => ({
    to,
    label: ORDER_STATUS_LABELS[to],
    allowed: result.ok,
    reason: result.ok ? null : result.reason,
  }))
  const t = order.totals
  const finalised = Boolean(order.fulfilment?.finalisedAt)

  return (
    <AdminPage props={props}>
      <div className="tf-header">
        <div>
          <h1 data-testid="fulfil-title">Objednávka {order.orderNumber}</h1>
          <div className="tf-row">
            <StatusPill status={order.status} />
            <TypePill type={type} />
            <span>{order.delivery?.methodName}</span>
            {order.delivery?.date && <strong>{formatDateLong(order.delivery.date)}</strong>}
          </div>
        </div>
        <div className="tf-row">
          <a className="tf-btn" href={`/admin/expedice?date=${order.scheduledDate ?? ''}`}>
            ← Expedice
          </a>
          <a
            className="tf-btn"
            href={`/api/fulfilment/print/packing?id=${order.id}`}
            target="_blank"
          >
            Balicí list
          </a>
          <a className="tf-btn" href={`/admin/collections/orders/${order.id}`}>
            Všechny údaje
          </a>
        </div>
      </div>

      {order.needsReview && (
        <div className="tf-banner tf-banner--warn" data-testid="fulfil-review">
          <strong>Ke kontrole</strong>
          {(order.reviewReasons ?? '')
            .split('\n')
            .filter(Boolean)
            .map((reason, i) => (
              <p key={i}>{reason}</p>
            ))}
        </div>
      )}
      {order.shipment?.provider === 'simulation' && (
        <div className="tf-banner tf-banner--sim">
          SIMULACE: zásilka {order.trackingNumber} nebyla odeslána žádnému dopravci (Balíkobot není
          nastaven).
        </div>
      )}
      {order.status === 'cancelled' && (
        <div className="tf-banner tf-banner--err">
          Zrušeno {when(order.cancellation?.cancelledAt)}: {order.cancellation?.reason}
        </div>
      )}

      <div className="tf-grid">
        <div className="tf-card">
          <h3>Zákazník</h3>
          <div>
            <strong>{order.customerName}</strong>
            {order.customer?.companyName ? `, ${order.customer.companyName}` : ''}
            {order.customer?.ico
              ? ` (IČO ${order.customer.ico}${order.customer.dic ? `, DIČ ${order.customer.dic}` : ''})`
              : ''}
          </div>
          <div>
            <a href={`tel:${(order.contactPhone ?? '').replace(/\s/g, '')}`}>
              {order.contactPhone}
            </a>{' '}
            · <a href={`mailto:${order.contactEmail}`}>{order.contactEmail}</a>
          </div>
          <div className="tf-muted" style={{ marginTop: 6 }}>
            {type === 'pickup'
              ? `Vyzvednutí: ${order.delivery?.pickupLocation?.name ?? ''}, ${addressLine(order.delivery?.pickupLocation ?? {})}`
              : `Adresa: ${addressLine(order.shippingAddress ?? {})}`}
          </div>
          {order.customerNote && (
            <div className="tf-banner tf-banner--warn" style={{ marginTop: 10, marginBottom: 0 }}>
              Poznámka zákazníka:{' '}
              <span style={{ color: 'var(--theme-text)' }}>{order.customerNote}</span>
            </div>
          )}
        </div>
        <div className="tf-card">
          <h3>Vážení</h3>
          <p style={{ margin: '0 0 8px' }}>
            {order.fulfilment?.weighedAt
              ? `Zváženo ${when(order.fulfilment.weighedAt)}.`
              : weighed
                ? 'Všechny položky vyřešené.'
                : 'Ještě nezváženo.'}{' '}
            {finalised ? `Vyúčtování potvrzeno ${when(order.fulfilment?.finalisedAt)}.` : ''}
          </p>
          {(order.status === 'received' || order.status === 'weighed') && (
            <a
              className="tf-btn"
              href={`/admin/vazeni/${order.id}`}
              data-testid="fulfil-weigh-link"
            >
              {order.status === 'received' ? 'Vážit' : 'Upravit vážení'}
            </a>
          )}
        </div>
      </div>

      <div className="tf-card">
        <h3>Položky</h3>
        <div className="tf-table-wrap">
          <table className="tf-table" data-testid="fulfil-lines">
            <thead>
              <tr>
                <th>Zboží</th>
                <th className="num">Počet</th>
                <th className="num">Cena / jedn.</th>
                <th className="num">Cíl</th>
                <th className="num">Zváženo</th>
                <th className="num">Odchylka</th>
                <th className="num">Odhad</th>
                <th className="num">Cena</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const target = estimatedLineGrams(line)
                const dev = weightDeviation(target, line.actualWeightGrams ?? null)
                return (
                  <tr key={line.id}>
                    <td>
                      <strong>{line.productTitle}</strong>
                      {line.variantLabel ? ` – ${line.variantLabel}` : ''}
                      {line.resolution &&
                        line.resolution !== 'weighed' &&
                        line.resolution !== 'piece' && (
                          <div className="tf-small" style={{ color: 'var(--tf-warn)' }}>
                            {LINE_RESOLUTION_LABELS[line.resolution as LineResolution]}
                            {line.weighNote ? `: ${line.weighNote}` : ''}
                          </div>
                        )}
                      {line.toleranceNote && (
                        <div className="tf-small tf-muted">
                          Důvod odchylky: {line.toleranceNote}
                        </div>
                      )}
                    </td>
                    <td className="num">{line.quantity}×</td>
                    <td className="num">
                      {formatUnitPrice(line.unitPrice)} / {UNIT_LABEL[line.priceUnit]}
                    </td>
                    <td className="num">{target ? formatWeight(target) : '–'}</td>
                    <td className="num">
                      {line.actualWeightGrams
                        ? formatWeight(line.actualWeightGrams)
                        : line.priceUnit === 'piece'
                          ? 'kus'
                          : '–'}
                    </td>
                    <td
                      className="num"
                      style={{ color: line.overTolerance ? 'var(--tf-warn)' : undefined }}
                    >
                      {formatDeviation(dev)}
                    </td>
                    <td className="num tf-muted">{formatCzk(line.estimatedPrice)}</td>
                    <td className="num">
                      <strong>
                        {typeof line.finalPrice === 'number' ? formatCzk(line.finalPrice) : '–'}
                      </strong>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>Zboží</td>
                <td className="num tf-muted">{formatCzk(t.goodsEstimate)}</td>
                <td className="num">
                  {typeof t.goodsFinal === 'number' ? formatCzk(t.goodsFinal) : '–'}
                </td>
              </tr>
              <tr>
                <td colSpan={6}>Doprava ({order.delivery?.methodName})</td>
                <td className="num tf-muted">
                  {t.deliveryPrice ? formatCzk(t.deliveryPrice) : 'zdarma'}
                </td>
                <td className="num">{t.deliveryPrice ? formatCzk(t.deliveryPrice) : 'zdarma'}</td>
              </tr>
              <tr>
                <td colSpan={6}>Celkem vč. DPH</td>
                <td className="num tf-muted">{formatCzk(t.totalEstimate)}</td>
                <td className="num" data-testid="fulfil-total-final">
                  {typeof t.totalFinal === 'number' ? formatCzk(t.totalFinal) : '–'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {(t.vatFinal ?? []).length > 0 && (
          <table className="tf-table" style={{ marginTop: 12, maxWidth: 520 }}>
            <thead>
              <tr>
                <th>DPH po zvážení</th>
                <th className="num">Základ</th>
                <th className="num">DPH</th>
                <th className="num">Celkem</th>
              </tr>
            </thead>
            <tbody>
              {(t.vatFinal ?? []).map((row) => (
                <tr key={row.rate}>
                  <td>{row.rate} %</td>
                  <td className="num">{formatUnitPrice(row.base ?? 0)}</td>
                  <td className="num">{formatUnitPrice(row.vat ?? 0)}</td>
                  <td className="num">{formatUnitPrice(row.gross ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {order.kind === 'voucher' ? (
        <div className="tf-banner tf-banner--warn">
          Objednávka elektronických poukazů – platí se převodem předem. Platbu označte v{' '}
          <Link href="/admin/poukazy-platby" prefetch={false}>
            Poukazy – platby
          </Link>
          .
        </div>
      ) : null}

      {printedWanted > 0 ? (
        <div className="tf-card" data-testid="printed-vouchers">
          <h3>Tištěné dárkové poukazy ({printedWanted} ks)</h3>
          <p className="tf-small tf-muted" style={{ marginTop: 0 }}>
            Vystavte kódy, napište je na tištěné poukazy (nebo vytiskněte PDF) a přibalte k
            objednávce. Poukazy začnou platit, až zákazník objednávku převezme a zaplatí (stav
            Doručeno / Vyzvednuto).
          </p>
          {printed.length > 0 ? (
            <ul>
              {printed.map((v) => (
                <li key={v.id}>
                  <strong style={{ letterSpacing: 1 }}>{v.code}</strong> – {formatCzk(v.value)} (
                  {v.status === 'issued' ? 'čeká na zaplacení s objednávkou' : 'zaplacen, platný'})
                </li>
              ))}
            </ul>
          ) : null}
          {printed.length > 0 ? (
            <p>
              <a
                className="tf-btn"
                href={`/api/gift-vouchers/orders/${order.id}/pdf`}
                target="_blank"
                rel="noopener"
              >
                Tisk poukazů (PDF)
              </a>
            </p>
          ) : null}
          {printed.length < printedWanted && order.status !== 'cancelled' ? (
            <IssuePrintedButton orderId={order.id} missing={printedWanted - printed.length} />
          ) : null}
        </div>
      ) : null}

      <FulfilmentClient
        order={{
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          scheduledDate: order.scheduledDate ?? null,
          methodType: type ?? null,
          weighed,
          finalised,
          totalFinal: t.totalFinal ?? null,
          amountDue: t.amountDue ?? null,
          voucherCode: order.voucherCode ?? null,
          vouchers: (order.voucherRedemptions ?? []).map((v) => ({
            code: v.code,
            amount: v.amount,
            note: v.note ?? '',
          })),
          invoiceNumber: order.invoiceNumber ?? '',
          internalNote: order.internalNote ?? '',
          trackingNumber: order.trackingNumber ?? null,
          trackingUrl: order.trackingUrl ?? null,
          shipment: {
            provider: order.shipment?.provider ?? null,
            packageId: order.shipment?.packageId ?? null,
            handedOverAt: order.shipment?.handedOverAt ?? null,
            lastError: order.shipment?.lastError ?? null,
          },
          sentEmails: (order.sentEmails ?? []).map((row) => ({
            kind: row.kind as FulfilmentEmailKind,
            label: SENT_EMAIL_LABELS[row.kind as SentEmailKind] ?? row.kind ?? '',
            status: EMAIL_STATUS_LABELS[row.status as EmailStatus] ?? row.status ?? '',
            failed: row.status === 'failed',
            at: when(row.at),
            to: row.to ?? '',
            error: row.error ?? null,
          })),
        }}
        statuses={statuses}
        carrierMode={carrierMode()}
      />

      <div className="tf-card">
        <h3>Historie změn</h3>
        {audit.docs.length === 0 ? (
          <p className="tf-muted">Zatím beze změn.</p>
        ) : (
          <div className="tf-table-wrap">
            <table className="tf-table" data-testid="fulfil-audit">
              <thead>
                <tr>
                  <th>Kdy</th>
                  <th>Kdo</th>
                  <th>Co</th>
                  <th>Původně</th>
                  <th>Nově</th>
                </tr>
              </thead>
              <tbody>
                {audit.docs.map((row) => (
                  <tr key={row.id}>
                    <td className="tf-small">{when(row.at)}</td>
                    <td className="tf-small">{row.userEmail}</td>
                    <td>{row.field}</td>
                    <td className="tf-muted">{row.oldValue}</td>
                    <td>{row.newValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminPage>
  )
}
