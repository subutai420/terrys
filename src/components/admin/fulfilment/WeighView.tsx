import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'

import type { PriceUnit } from '@/lib/catalog'
import type { LineResolution } from '@/lib/orders/constants'
import { formatDateLong } from '@/lib/orders/format'
import { getFulfilmentSettings } from '@/fulfilment/settings'
import { loadOrder } from '@/fulfilment/service'

import { AdminPage, idFromSegments } from './AdminPage'
import { StatusPill } from './StatusPill'
import { type WeighClientLine, WeighingClient } from './WeighingClient'

/**
 * Weighing screen (/admin/vazeni/:id) for the cutting table – tablet or phone, big targets,
 * numeric keypad. Butcher, staff and admin. Saves through POST /api/fulfilment/orders/:id/weigh.
 */
export async function WeighView(props: AdminViewServerProps) {
  const { req } = props.initPageResult
  const user = req.user as { role?: string } | null
  const id = idFromSegments(props)
  // Custom views are public by default: anonymous visitors go to the login.
  if (!user) redirect(`/admin/login?redirect=${encodeURIComponent('/admin/expedice')}`)
  if (!['admin', 'staff', 'butcher'].includes(user.role ?? '')) {
    return (
      <AdminPage props={props}>
        <p>Pro vážení se přihlaste.</p>
      </AdminPage>
    )
  }
  const order = id ? await loadOrder(req.payload, id, req) : null
  if (!order) {
    return (
      <AdminPage props={props}>
        <p>Objednávka nenalezena.</p>
        <Link className="tf-btn" href="/admin/expedice" prefetch={false}>
          ← Expedice
        </Link>
      </AdminPage>
    )
  }
  const { tolerancePercent } = await getFulfilmentSettings(req.payload, req)
  const isButcher = user.role === 'butcher'
  const editable = order.status === 'received' || (order.status === 'weighed' && !isButcher)
  const lines: WeighClientLine[] = (order.lines ?? []).map((line) => ({
    id: line.id ?? '',
    productTitle: line.productTitle,
    variantLabel: line.variantLabel ?? null,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    priceUnit: line.priceUnit as PriceUnit,
    vatRate: line.vatRate,
    estimatedWeightGrams: line.estimatedWeightGrams ?? null,
    estimatedPrice: line.estimatedPrice,
    actualWeightGrams: line.actualWeightGrams ?? null,
    resolution: (line.resolution ?? null) as LineResolution | null,
    pieceWeights: line.pieceWeights ?? null,
    weighNote: line.weighNote ?? null,
    toleranceNote: line.toleranceNote ?? null,
  }))

  return (
    <AdminPage props={props}>
      <div className="tf-weigh">
        <div className="tf-header">
          <div>
            <h1 data-testid="weigh-title">Vážení – objednávka {order.orderNumber}</h1>
            <div className="tf-row">
              <StatusPill status={order.status} />
              <span>{order.customerName}</span>
              <span className="tf-muted">
                {order.delivery?.methodName}
                {order.delivery?.date ? ` · ${formatDateLong(order.delivery.date)}` : ''}
              </span>
            </div>
          </div>
          <a className="tf-btn" href={`/admin/expedice?date=${order.scheduledDate ?? ''}`}>
            ← Expedice
          </a>
        </div>
        {order.customerNote && (
          <div className="tf-weigh-note" data-testid="weigh-customer-note">
            <strong>Poznámka zákazníka:</strong> {order.customerNote}
          </div>
        )}
        {!editable && (
          <div className="tf-banner tf-banner--ok">
            {order.status === 'weighed'
              ? 'Objednávka je zvážená. Pokud je potřeba něco opravit, řekněte obsluze.'
              : 'Objednávku v tomto stavu už nelze vážit.'}
          </div>
        )}
        <WeighingClient
          deliveryPrice={order.totals.deliveryPrice}
          editable={editable}
          estimateTotal={order.totals.goodsEstimate}
          lines={lines}
          orderId={order.id}
          status={order.status}
          tolerancePercent={tolerancePercent}
          backHref={`/admin/expedice?date=${order.scheduledDate ?? ''}`}
        />
      </div>
    </AdminPage>
  )
}
