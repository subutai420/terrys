import type { AdminViewServerProps } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'

import { addDays, formatCzechDate, isIsoDate, weekdayOf } from '@/lib/delivery/calendar'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import { formatCzk } from '@/lib/format'
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from '@/lib/orders/constants'
import { formatDateLong } from '@/lib/orders/format'
import { formatKg, orderGrams, ordersCountText, type WeighLine } from '@/lib/orders/fulfilment'
import { carrierMode } from '@/shipping/carrier'
import { dayCounts, ordersForDay, searchOrders, shopToday } from '@/fulfilment/queries'
import type { Order } from '@/payload-types'

import { AdminPage, searchParam } from './AdminPage'
import { DayActions } from './DayActions'
import { METHOD_SHORT, StatusPill, TypePill } from './StatusPill'

const WEEKDAY: Record<string, string> = {
  mon: 'po',
  tue: 'út',
  wed: 'st',
  thu: 'čt',
  fri: 'pá',
  sat: 'so',
  sun: 'ne',
}
const TYPES: (ShippingMethodType | 'all')[] = ['all', 'own-delivery', 'courier', 'pickup']
const GROUP_TITLES: Record<ShippingMethodType, string> = {
  'own-delivery': 'Rozvoz vlastním vozem',
  courier: 'Kurýr (Balíkobot)',
  pickup: 'Osobní odběr',
}

function OrderRow({
  order,
  isEditor,
  showDate,
}: {
  order: Order
  isEditor: boolean
  showDate?: boolean
}) {
  const lines = (order.lines ?? []) as WeighLine[]
  const grams = orderGrams(lines)
  const type = order.delivery?.methodType as ShippingMethodType | undefined
  const weighable = order.status === 'received' || (isEditor && order.status === 'weighed')
  const summary = lines
    .map((l) => `${l.quantity}× ${l.productTitle}${l.variantLabel ? ` ${l.variantLabel}` : ''}`)
    .join(', ')
  return (
    <div
      className={`tf-order tf-order--${order.status}`}
      data-testid="expedice-order"
      data-order={order.orderNumber}
    >
      <div>
        <div className="tf-row">
          <a
            className="tf-order-no"
            href={isEditor ? `/admin/vyrizeni/${order.id}` : `/admin/vazeni/${order.id}`}
          >
            {order.orderNumber}
          </a>
          <StatusPill status={order.status} />
          <span>{order.customerName}</span>
          <a className="tf-muted" href={`tel:${(order.contactPhone ?? '').replace(/\s/g, '')}`}>
            {order.contactPhone}
          </a>
          {order.needsReview && <span className="tf-pill tf-pill--flag">⚠ ke kontrole</span>}
          {order.customerNote && (
            <span className="tf-pill tf-pill--flag" title={order.customerNote}>
              ✎ poznámka
            </span>
          )}
          {order.voucherCode && (order.voucherRedemptions ?? []).length === 0 && (
            <span className="tf-pill tf-pill--flag">poukaz k ověření</span>
          )}
          {order.shipment?.provider === 'simulation' && (
            <span className="tf-pill tf-pill--cancelled" style={{ textDecoration: 'none' }}>
              SIMULACE
            </span>
          )}
        </div>
        <div className="tf-order-lines">
          {showDate && order.scheduledDate ? (
            <strong>{formatDateLong(order.scheduledDate)} · </strong>
          ) : null}
          {summary} · {formatKg(grams)}
          {type === 'pickup' ? ` · ${order.delivery?.pickupLocation?.name ?? ''}` : ''}
          {type !== 'pickup' && order.shippingAddress?.city
            ? ` · ${order.shippingAddress.city}`
            : ''}
          {' · '}
          {typeof order.amountDue === 'number' ? (
            <strong>vybrat {formatCzk(order.amountDue)}</strong>
          ) : (
            `odhad ${formatCzk(order.totalEstimate ?? 0)}`
          )}
          {order.invoiceNumber ? ` · fa ${order.invoiceNumber}` : ''}
          {order.trackingNumber ? ` · zásilka ${order.trackingNumber}` : ''}
        </div>
      </div>
      <div className="tf-actions">
        {weighable && (
          <a
            className={`tf-btn${order.status === 'received' ? ' tf-btn--primary' : ''}`}
            data-testid="action-weigh"
            href={`/admin/vazeni/${order.id}`}
          >
            Vážit
          </a>
        )}
        {isEditor && (
          <a
            className={`tf-btn${order.status === 'weighed' ? ' tf-btn--primary' : ''}`}
            data-testid="action-fulfil"
            href={`/admin/vyrizeni/${order.id}`}
          >
            Vyřídit
          </a>
        )}
        <a className="tf-btn" href={`/api/fulfilment/print/packing?id=${order.id}`} target="_blank">
          Balicí list
        </a>
        {isEditor && order.shipment?.packageId && (
          <a className="tf-btn" href={`/api/fulfilment/orders/${order.id}/label`} target="_blank">
            Štítek
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * Custom admin view "Expedice" (/admin/expedice): the day's orders grouped by delivery method,
 * with counts and estimated kg, filters, quick search and the day's print/bulk actions.
 */
export async function ExpediceView(props: AdminViewServerProps) {
  const { req } = props.initPageResult
  const user = req.user as { role?: string } | null
  // Custom views are public by default: anonymous visitors go to the login.
  if (!user) redirect(`/admin/login?redirect=${encodeURIComponent('/admin/expedice')}`)
  if (!['admin', 'staff', 'butcher'].includes(user.role ?? '')) {
    return (
      <AdminPage props={props}>
        <p>Pro zobrazení expedice se přihlaste.</p>
      </AdminPage>
    )
  }
  const isEditor = user.role !== 'butcher'
  const today = shopToday()
  const rawDate = searchParam(props, 'date')
  const date = isIsoDate(rawDate) ? rawDate : today
  const rawType = searchParam(props, 'type') as ShippingMethodType | 'all'
  const type = TYPES.includes(rawType) ? rawType : 'all'
  const rawStatus = searchParam(props, 'status')
  const status = (['open', 'all', ...ORDER_STATUSES] as string[]).includes(rawStatus)
    ? (rawStatus as OrderStatus | 'open' | 'all')
    : 'open'
  const q = searchParam(props, 'q').trim()

  const [orders, strip] = await Promise.all([
    q ? searchOrders(req.payload, q, req) : ordersForDay(req.payload, { date, type, status }, req),
    dayCounts(req.payload, addDays(today, -1), 9, req),
  ])
  const mode = carrierMode()

  const link = (params: Record<string, string>) => {
    const merged = { date, type, status, ...params }
    const query = new URLSearchParams(
      Object.entries(merged).filter(
        ([k, v]) => v && !(k === 'type' && v === 'all') && !(k === 'status' && v === 'open'),
      ),
    )
    return `/admin/expedice?${query.toString()}`
  }

  const active = orders.filter((o) => o.status !== 'cancelled')
  const grams = active.reduce((sum, o) => sum + orderGrams((o.lines ?? []) as WeighLine[]), 0)
  const count = (s: OrderStatus) => active.filter((o) => o.status === s).length
  const groups = q
    ? [{ key: 'search', title: `Výsledky hledání „${q}“`, orders }]
    : (['own-delivery', 'courier', 'pickup'] as ShippingMethodType[])
        .map((t) => ({
          key: t,
          title: GROUP_TITLES[t],
          orders: orders.filter((o) => o.delivery?.methodType === t),
        }))
        .filter((g) => g.orders.length)
  const hasCourier = orders.some((o) => o.delivery?.methodType === 'courier')
  const hasVan = orders.some((o) => o.delivery?.methodType === 'own-delivery')

  return (
    <AdminPage props={props}>
      <div className="tf-header">
        <div>
          <h1>Expedice</h1>
          <div className="tf-muted">
            {q
              ? 'Hledání ve všech objednávkách'
              : `${formatDateLong(date)}${date === today ? ' (dnes)' : ''}`}
          </div>
        </div>
        <div className="tf-row">
          <a
            className="tf-btn"
            href={`/api/fulfilment/print/production?date=${date}`}
            target="_blank"
            data-testid="print-production"
          >
            Výrobní list
          </a>
          <a className="tf-btn" href={`/api/fulfilment/print/route?date=${date}`} target="_blank">
            Rozvoz a výdej
          </a>
          <a className="tf-btn" href={`/api/fulfilment/print/packing?date=${date}`} target="_blank">
            Balicí listy
          </a>
          {isEditor && hasCourier && (
            <a className="tf-btn" href={`/api/fulfilment/labels?date=${date}`} target="_blank">
              Štítky dne
            </a>
          )}
        </div>
      </div>

      {isEditor && mode !== 'live' && (
        <div className={`tf-banner ${mode === 'missing' ? 'tf-banner--err' : 'tf-banner--sim'}`}>
          {mode === 'missing'
            ? 'Balíkobot není nastaven – zásilky kurýrem nejde vytvořit (chybí BALIKOBOT_API_USER / BALIKOBOT_API_KEY).'
            : 'Balíkobot běží v SIMULACI: zásilky se nikam neposílají, štítky jsou jen ukázka. Viz README → Simulace.'}
        </div>
      )}

      <nav className="tf-days" aria-label="Dny">
        {strip.map((day) => (
          <a
            className={`tf-day${day.date === date && !q ? ' tf-day--active' : ''}`}
            href={link({ date: day.date, q: '' })}
            key={day.date}
          >
            <strong>
              {day.date === today
                ? 'Dnes'
                : day.date === addDays(today, 1)
                  ? 'Zítra'
                  : WEEKDAY[weekdayOf(day.date)]}{' '}
              {formatCzechDate(day.date).replace(/\s?\d{4}$/, '')}
            </strong>
            <span className="tf-small tf-muted">
              {day.orders} obj. · {formatKg(day.grams)}
              {day.toWeigh ? ` · ${day.toWeigh} k vážení` : ''}
            </span>
          </a>
        ))}
      </nav>

      <form className="tf-filters" method="get" action="/admin/expedice">
        <label>
          Den
          <input defaultValue={date} name="date" type="date" />
        </label>
        <label>
          Doprava
          <select defaultValue={type} name="type">
            <option value="all">Vše</option>
            {(['own-delivery', 'courier', 'pickup'] as ShippingMethodType[]).map((t) => (
              <option key={t} value={t}>
                {METHOD_SHORT[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stav
          <select defaultValue={status} name="status">
            <option value="open">Vše kromě zrušených</option>
            <option value="all">Vše</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: '1 1 220px' }}>
          Hledat (číslo, jméno, telefon)
          <input
            defaultValue={q}
            name="q"
            placeholder="např. 100123 nebo Nováková"
            type="search"
            data-testid="expedice-search"
          />
        </label>
        <button className="tf-btn tf-btn--primary" type="submit">
          Zobrazit
        </button>
        {q && (
          <a className="tf-btn" href={link({ q: '' })}>
            Zrušit hledání
          </a>
        )}
      </form>

      {!q && (
        <div className="tf-stats">
          <div className="tf-stat">
            <strong>{active.length}</strong>
            <span>{ordersCountText(active.length).replace(/^\d+ /, '')}</span>
          </div>
          <div className="tf-stat">
            <strong>{formatKg(grams)}</strong>
            <span>odhad masa</span>
          </div>
          <div className={`tf-stat${count('received') ? ' tf-stat--warn' : ''}`}>
            <strong>{count('received')}</strong>
            <span>k vážení</span>
          </div>
          <div className="tf-stat">
            <strong>{count('weighed')}</strong>
            <span>zváženo</span>
          </div>
          <div className="tf-stat">
            <strong>{count('shipped') + count('ready-for-pickup')}</strong>
            <span>odesláno / připraveno</span>
          </div>
        </div>
      )}

      {isEditor && !q && (hasCourier || hasVan) && (
        <div className="tf-row" style={{ marginBottom: 16 }}>
          <span className="tf-muted tf-small">Hromadně pro tento den:</span>
          <DayActions
            date={date}
            actions={[
              ...(hasCourier ? (['create-shipments', 'close-batch'] as const) : []),
              ...(hasVan ? (['van-departed'] as const) : []),
            ]}
          />
        </div>
      )}

      {groups.length === 0 && (
        <div className="tf-card tf-muted" data-testid="expedice-empty">
          {q ? 'Nic nenalezeno.' : 'Na tento den nejsou žádné objednávky (s vybranými filtry).'}
        </div>
      )}
      {groups.map((group) => (
        <section key={group.key}>
          <div className="tf-group-title">
            <h2>{group.title}</h2>
            <span className="tf-muted">
              {group.orders.length} obj. ·{' '}
              {formatKg(
                group.orders.reduce((s, o) => s + orderGrams((o.lines ?? []) as WeighLine[]), 0),
              )}
            </span>
            {group.key !== 'search' && <TypePill type={group.key} />}
          </div>
          <div className="tf-orders">
            {group.orders.map((order) => (
              <OrderRow isEditor={isEditor} key={order.id} order={order} showDate={Boolean(q)} />
            ))}
          </div>
        </section>
      ))}
    </AdminPage>
  )
}
