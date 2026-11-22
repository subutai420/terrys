import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import { hasRole } from '@/access'
import { formatCzk } from '@/lib/format'
import { formatIsoDay } from '@/lib/vouchers/balance'
import { toShopDate } from '@/lib/delivery/calendar'
import {
  AVAILABILITY_PROBLEM_TEXT,
  type PaymentRow,
  voucherPaymentsOverview,
} from '@/vouchers/queries'

import { AdminPage } from '../fulfilment/AdminPage'

import { PaymentActions } from './PaymentActions'
import { VoucherLookup } from './VoucherLookup'

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('cs-CZ', {
        timeZone: 'Europe/Prague',
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–'

const age = (hours: number) =>
  hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d ${hours % 24} h`

function Customer({ row }: { row: PaymentRow }) {
  return (
    <>
      <strong>{row.customerName}</strong>
      {row.company ? <div className="tf-small">{row.company}</div> : null}
      <div className="tf-small">
        <a href={`mailto:${row.email}`}>{row.email}</a> · {row.phone}
      </div>
    </>
  )
}

/**
 * "Poukazy – platby" (stage 7): the colleague's screen for pairing bank payments of ELECTRONIC
 * vouchers. One table "Čekají na platbu" – the variable symbol in the bank statement is the order
 * number in the first column; she compares the amount and clicks "Zaplaceno". Overdue rows are
 * red. Below: payments marked in the last 14 days (with "Vrátit" for a mis-click), cancelled
 * ones, and the code search + old-shop vouchers.
 */
export async function VoucherPaymentsView(props: AdminViewServerProps) {
  const { req } = props.initPageResult
  if (!hasRole(req.user, 'admin', 'staff')) {
    return (
      <AdminPage props={props}>
        <p>Tuto stránku vidí jen obsluha.</p>
      </AdminPage>
    )
  }
  const data = await voucherPaymentsOverview(req.payload)
  const overdue = data.awaiting.filter((r) => r.overdue).length

  return (
    <AdminPage props={props}>
      <div className="tf-header">
        <h1 style={{ margin: 0 }}>Poukazy – platby</h1>
        <Link className="tf-btn" href="/admin/collections/vouchers" prefetch={false}>
          Všechny poukazy
        </Link>
      </div>

      {data.availability.problem ? (
        <div className="tf-banner tf-banner--err" data-testid="voucher-availability-problem">
          {AVAILABILITY_PROBLEM_TEXT[data.availability.problem]}
        </div>
      ) : null}
      {data.batchExpiresSoon ? (
        <div className="tf-banner tf-banner--warn">
          Aktivní šarže platí jen do {formatIsoDay(toShopDate(data.batchExpiresSoon))} – nové
          poukazy by měly krátkou platnost. Založte novou šarži (Poukazy → Šarže poukazů).
        </div>
      ) : null}

      <div className="tf-card">
        <h2>
          Čekají na platbu ({data.awaiting.length}
          {overdue ? <span className="tf-error">, po splatnosti {overdue}</span> : null})
        </h2>
        <p className="tf-small">
          Ve výpisu z banky najděte platbu podle <strong>variabilního symbolu</strong> (= číslo
          objednávky) a zkontrolujte částku. Pak „Zaplaceno“ – poukazy začnou platit a zákazník
          dostane e-mail. Splatnost je 72 hodin (Nastavení obchodu).
        </p>
        {data.awaiting.length === 0 ? (
          <p className="tf-muted" data-testid="payments-empty">
            Nic nečeká – všechny elektronické poukazy jsou zaplacené.
          </p>
        ) : (
          <div className="tf-table-wrap">
            <table className="tf-table" data-testid="payments-awaiting">
              <thead>
                <tr>
                  <th>VS (obj.)</th>
                  <th>Částka</th>
                  <th>Zákazník</th>
                  <th>Objednáno</th>
                  <th>Splatnost</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {data.awaiting.map((row) => (
                  <tr
                    key={row.id}
                    data-testid="payment-row"
                    data-order={row.orderNumber}
                    style={row.overdue ? { background: '#fdecec' } : undefined}
                  >
                    <td>
                      <a href={`/admin/collections/orders/${row.id}`} style={{ fontSize: 17 }}>
                        <strong>{row.orderNumber}</strong>
                      </a>
                      <div className="tf-small">{row.vouchers}</div>
                    </td>
                    <td>
                      <strong style={{ fontSize: 17 }}>{formatCzk(row.amount)}</strong>
                    </td>
                    <td>
                      <Customer row={row} />
                    </td>
                    <td>
                      {when(row.createdAt)}
                      <div className="tf-small">před {age(row.ageHours)}</div>
                    </td>
                    <td>
                      {row.overdue ? <strong className="tf-error">PO SPLATNOSTI</strong> : null}
                      <div>{when(row.dueAt)}</div>
                      {row.reminderSentAt ? (
                        <div className="tf-small">připomenuto {when(row.reminderSentAt)}</div>
                      ) : null}
                    </td>
                    <td>
                      <PaymentActions
                        orderId={row.id}
                        orderNumber={row.orderNumber}
                        mode="awaiting"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="tf-card">
        <h2>Zaplaceno za posledních 14 dní ({data.recentlyPaid.length})</h2>
        {data.recentlyPaid.length === 0 ? (
          <p className="tf-muted">Zatím nic.</p>
        ) : (
          <div className="tf-table-wrap">
            <table className="tf-table" data-testid="payments-paid">
              <thead>
                <tr>
                  <th>VS (obj.)</th>
                  <th>Částka</th>
                  <th>Zákazník</th>
                  <th>Platba přišla</th>
                  <th>Označeno</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.recentlyPaid.map((row) => (
                  <tr key={row.id} data-order={row.orderNumber}>
                    <td>
                      <a href={`/admin/collections/orders/${row.id}`}>{row.orderNumber}</a>
                    </td>
                    <td>{formatCzk(row.amount)}</td>
                    <td>
                      <Customer row={row} />
                    </td>
                    <td>{row.paidOn ? formatIsoDay(toShopDate(row.paidOn)) : '–'}</td>
                    <td>{when(row.markedPaidAt)}</td>
                    <td>
                      <PaymentActions orderId={row.id} orderNumber={row.orderNumber} mode="paid" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.recentlyCancelled.length > 0 ? (
        <div className="tf-card">
          <h2>Zrušené (nezaplacené) za 14 dní</h2>
          <ul>
            {data.recentlyCancelled.map((row) => (
              <li key={row.id}>
                <a href={`/admin/collections/orders/${row.id}`}>{row.orderNumber}</a> –{' '}
                {formatCzk(row.amount)}, {row.customerName}: {row.cancelledReason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <VoucherLookup />
    </AdminPage>
  )
}
