import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { findPostcodeRecord, loadDeliveryRules } from '@/delivery/rules'
import { type DayStatus, getDeliveryCalendar } from '@/lib/delivery/availability'
import {
  addDays,
  formatCzechDate,
  isoDate,
  toShopDateTime,
  weekdayOf,
} from '@/lib/delivery/calendar'
import {
  formatPostcode,
  isValidPostcode,
  normalizePostcode,
  UNAVAILABLE_REASON_MESSAGES,
  WEEKDAY_SHORT_LABELS,
} from '@/lib/delivery/constants'

const MONTHS = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec',
]

const cell: React.CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid var(--theme-elevation-100)',
  textAlign: 'left',
  verticalAlign: 'top',
}

function statusText(status: DayStatus): { text: string; color: string } {
  if (status.open) {
    return status.why === 'open-exception'
      ? { text: `✓ navíc: ${status.exception?.reason ?? ''}`, color: 'var(--theme-success-600)' }
      : { text: '✓', color: 'var(--theme-success-600)' }
  }
  return status.why === 'closed-exception'
    ? { text: `✕ ${status.exception?.reason ?? ''}`, color: 'var(--theme-error-500)' }
    : { text: '–', color: 'var(--theme-elevation-400)' }
}

/**
 * Custom admin view "Kalendář doručování" (/admin/kalendar-doruceni): for a chosen postcode and
 * month, which days each shipping method delivers. Read-only; it uses the same engine as the
 * cart, but ignores the cut-off time (that depends on when the customer orders).
 */
export async function DeliveryCalendarView({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req } = initPageResult
  const template = (children: React.ReactNode) => (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>{children}</Gutter>
    </DefaultTemplate>
  )

  // Custom views are public by default – require a logged-in admin user.
  if (!req.user) {
    return template(<p>Pro zobrazení kalendáře se přihlaste.</p>)
  }

  const today = toShopDateTime(new Date()).date
  const rawPsc = typeof searchParams?.psc === 'string' ? searchParams.psc : '12000'
  const rawMonth = typeof searchParams?.month === 'string' ? searchParams.month : ''
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(rawMonth)
  const year = monthMatch ? Number(monthMatch[1]) : Number(today.slice(0, 4))
  const month = monthMatch
    ? Math.min(12, Math.max(1, Number(monthMatch[2])))
    : Number(today.slice(5, 7))
  const from = isoDate(year, month, 1)
  const to = addDays(isoDate(year, month + 1, 1), -1)
  const monthParam = (offset: number) => isoDate(year, month + offset, 1).slice(0, 7)
  const psc = normalizePostcode(rawPsc)

  const form = (
    <form method="get" style={{ display: 'flex', gap: '1em', alignItems: 'end', flexWrap: 'wrap' }}>
      <label>
        PSČ
        <br />
        <input defaultValue={rawPsc} name="psc" size={8} />
      </label>
      <label>
        Měsíc
        <br />
        <input defaultValue={from.slice(0, 7)} name="month" type="month" />
      </label>
      <button type="submit">Zobrazit</button>
      <a href={`?psc=${psc}&month=${monthParam(-1)}`}>← předchozí měsíc</a>
      <a href={`?psc=${psc}&month=${monthParam(1)}`}>další měsíc →</a>
    </form>
  )

  if (!isValidPostcode(psc)) {
    return template(
      <>
        <h1>Kalendář doručování</h1>
        {form}
        <p style={{ color: 'var(--theme-error-500)' }}>
          Zadejte platné PSČ (5 číslic, začíná 1–7).
        </p>
      </>,
    )
  }

  const [rules, record] = await Promise.all([
    loadDeliveryRules(req.payload, { from, to }),
    findPostcodeRecord(req.payload, psc),
  ])
  const calendar = getDeliveryCalendar({
    postcode: psc,
    postcodeRecord: record,
    methods: rules.methods,
    zones: rules.zones,
    exceptions: rules.exceptions,
    from,
    to,
  })
  if (!calendar.ok) return template(<p>Neplatné PSČ.</p>)

  const available = calendar.methods.filter((m) => !m.reason)
  const unavailable = calendar.methods.filter((m) => m.reason)
  const days = available[0]?.days.map((d) => d.date) ?? []

  return template(
    <>
      <h1>Kalendář doručování</h1>
      <p>
        Přehled, ve které dny se doručuje / vydává pro zvolené PSČ (bez ohledu na uzávěrku
        objednávek). Den vypnete jedním záznamem v <strong>Doručování → Výjimky v kalendáři</strong>
        ; dny v týdnu se nastavují u způsobu dopravy nebo rozvozové oblasti.
      </p>
      {form}
      <h2 style={{ marginTop: '1em' }}>
        {formatPostcode(psc)} {record?.city ? `– ${record.city}` : ''} · {MONTHS[month - 1]} {year}
      </h2>
      {!calendar.known && (
        <p style={{ color: 'var(--theme-warning-600, orange)' }}>
          Toto PSČ není v seznamu PSČ – zákazník uvidí jen osobní odběr.
        </p>
      )}
      {unavailable.length > 0 && (
        <ul>
          {unavailable.map((m) => (
            <li key={String(m.id)}>
              <strong>{m.name}</strong>: nenabízí se – {UNAVAILABLE_REASON_MESSAGES[m.reason!]}
            </li>
          ))}
        </ul>
      )}
      {available.length === 0 ? (
        <p>Pro toto PSČ není aktivní žádný způsob dopravy.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1em' }}>
          <thead>
            <tr>
              <th style={cell}>Den</th>
              {available.map((m) => (
                <th key={String(m.id)} style={cell}>
                  {m.name}
                  {m.zoneName && (
                    <div style={{ fontWeight: 'normal', fontSize: '0.85em' }}>
                      oblast: {m.zoneName}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((date, index) => (
              <tr
                key={date}
                style={date === today ? { background: 'var(--theme-elevation-50)' } : undefined}
              >
                <td style={cell}>
                  {WEEKDAY_SHORT_LABELS[weekdayOf(date)]} {formatCzechDate(date)}
                  {date === today && ' (dnes)'}
                </td>
                {available.map((m) => {
                  const { text, color } = statusText(m.days[index].status)
                  return (
                    <td key={String(m.id)} style={{ ...cell, color }}>
                      {text}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ marginTop: '1em', fontSize: '0.9em' }}>
        ✓ = doručujeme / vydáváme, ✕ = vypnuto výjimkou, – = v tento den v týdnu ne.
      </p>
    </>,
  )
}
