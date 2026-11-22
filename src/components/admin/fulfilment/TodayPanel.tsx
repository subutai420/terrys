import type { Payload } from 'payload'
import Link from 'next/link'
import React from 'react'

import { formatDateLong } from '@/lib/orders/format'
import { todaySummary } from '@/fulfilment/queries'
import { AVAILABILITY_PROBLEM_TEXT, voucherDashboardCounts } from '@/vouchers/queries'

/**
 * "Dnes" panel on the admin home (stage 5): what needs doing today, with links. Deliberately
 * small – no analytics (a later stage).
 */
export async function TodayPanel({
  payload,
  user,
}: {
  payload: Payload
  user?: { role?: string } | null
}) {
  if (!user || !['admin', 'staff', 'butcher'].includes(user.role ?? '')) return null
  const s = await todaySummary(payload)
  const isEditor = user.role !== 'butcher'
  // Stage 7: electronic vouchers waiting for the bank transfer (staff pairs them).
  const v = isEditor ? await voucherDashboardCounts(payload) : null
  const tile = (href: string, value: number, label: string, warn = false, testId?: string) => (
    <a
      className={`tf-stat${warn && value > 0 ? ' tf-stat--warn' : ''}`}
      data-testid={testId}
      href={href}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </a>
  )
  return (
    <section className="tf tf-today" style={{ paddingBottom: 0 }} data-testid="today-panel">
      <div className="tf-header" style={{ marginTop: 0 }}>
        <h2 style={{ margin: 0 }}>Dnes – {formatDateLong(s.today)}</h2>
        <Link className="tf-btn tf-btn--primary" href="/admin/expedice" prefetch={false}>
          Otevřít Expedici
        </Link>
      </div>
      <div className="tf-stats">
        {tile(
          `/admin/expedice?date=${s.today}&status=received`,
          s.toWeigh,
          'k vážení',
          false,
          'today-to-weigh',
        )}
        {s.overdue > 0 &&
          tile(
            '/admin/collections/orders?where[status][in]=received,weighed',
            s.overdue,
            'po termínu!',
            true,
          )}
        {isEditor && tile(`/admin/expedice?date=${s.today}&status=weighed`, s.toShip, 'k odeslání')}
        {isEditor &&
          tile(
            '/admin/collections/orders?where[status][equals]=ready-for-pickup',
            s.readyForPickup,
            'čeká na vyzvednutí',
          )}
        {isEditor &&
          tile(
            '/admin/collections/orders?where[needsReview][equals]=true',
            s.flagged,
            'ke kontrole',
            true,
            'today-flagged',
          )}
        {isEditor &&
          tile(
            '/admin/collections/withdrawals?where[status][equals]=new',
            s.withdrawals,
            'odstoupení od smlouvy',
            true,
          )}
        {v &&
          tile(
            '/admin/poukazy-platby',
            v.awaiting,
            'poukazy čekají na platbu',
            false,
            'today-vouchers',
          )}
        {v &&
          v.overdue > 0 &&
          tile(
            '/admin/poukazy-platby',
            v.overdue,
            'poukazy po splatnosti',
            true,
            'today-vouchers-overdue',
          )}
      </div>
      {v?.availability.problem ? (
        <p className="tf-banner tf-banner--err" style={{ marginTop: 12 }}>
          {AVAILABILITY_PROBLEM_TEXT[v.availability.problem]}
        </p>
      ) : null}
    </section>
  )
}
