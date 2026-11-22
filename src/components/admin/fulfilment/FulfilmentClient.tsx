'use client'

import { toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import type { ShippingMethodType } from '@/lib/delivery/constants'
import { formatCzk } from '@/lib/format'
import {
  FULFILMENT_EMAIL_LABELS,
  type FulfilmentEmailKind,
  type OrderStatus,
} from '@/lib/orders/constants'
import { voucherAmountError } from '@/lib/orders/money'

import { VoucherRowCheck } from '../vouchers/VoucherRowCheck'
import { variableSymbol } from '@/lib/shipping/balikobot'

import { type ApiResponse, postJson, responseText } from './api'

type Voucher = { code: string; amount: number | ''; note: string }

export type FulfilmentOrder = {
  id: number
  orderNumber: string
  status: string
  scheduledDate: string | null
  methodType: ShippingMethodType | null
  weighed: boolean
  finalised: boolean
  totalFinal: number | null
  amountDue: number | null
  voucherCode: string | null
  vouchers: { code: string; amount: number; note: string }[]
  invoiceNumber: string
  internalNote: string
  trackingNumber: string | null
  trackingUrl: string | null
  shipment: {
    provider: string | null
    packageId: string | null
    handedOverAt: string | null
    lastError: string | null
  }
  sentEmails: {
    kind: FulfilmentEmailKind
    label: string
    status: string
    failed: boolean
    at: string
    to: string
    error: string | null
  }[]
}

type StatusButton = { to: OrderStatus; label: string; allowed: boolean; reason: string | null }

const CLOSED = ['delivered', 'picked-up', 'cancelled']

/** Interactive part of "Vyřízení objednávky": billing, shipment, status, e-mails. */
export function FulfilmentClient({
  order,
  statuses,
  carrierMode,
}: {
  order: FulfilmentOrder
  statuses: StatusButton[]
  carrierMode: 'live' | 'simulation' | 'missing'
}) {
  const router = useRouter()
  const [vouchers, setVouchers] = useState<Voucher[]>(order.vouchers)
  const [invoice, setInvoice] = useState(order.invoiceNumber)
  const [note, setNote] = useState(order.internalNote)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [invoiceCheck, setInvoiceCheck] = useState<{ value: string; warning: string | null }>({
    value: '',
    warning: null,
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const closed = CLOSED.includes(order.status)

  // Live uniqueness check of the invoice number (debounced; the result belongs to one value).
  const invoiceValue = invoice.trim()
  useEffect(() => {
    if (!invoiceValue || invoiceValue === order.invoiceNumber) return
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/fulfilment/invoice-check?number=${encodeURIComponent(invoiceValue)}&exclude=${order.id}`,
          { credentials: 'include' },
        )
        const data = (await res.json()) as { duplicate?: { orderNumber: string } | null }
        setInvoiceCheck({
          value: invoiceValue,
          warning: data.duplicate
            ? `Pozor: číslo ${invoiceValue} už má objednávka č. ${data.duplicate.orderNumber}.`
            : null,
        })
      } catch {
        // the server check on save still applies
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [invoiceValue, order.id, order.invoiceNumber])
  const invoiceWarning = invoiceCheck.value === invoiceValue ? invoiceCheck.warning : null

  const voucherTotal = vouchers.reduce(
    (sum, v) => sum + (typeof v.amount === 'number' ? v.amount : 0),
    0,
  )
  const amountDue = order.totalFinal === null ? null : order.totalFinal - voucherTotal
  const overCap = amountDue !== null && amountDue < 0
  const vsProblem =
    order.methodType === 'courier' &&
    (amountDue ?? 0) > 0 &&
    invoice.trim() &&
    !variableSymbol(invoice)
      ? 'Pro dobírku musí být číslo faktury jen z číslic (nejvýše 10) – použije se jako variabilní symbol.'
      : null

  const done = (result: ApiResponse, success: string) => {
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      toast.error(responseText(result) || 'Akce selhala.', { duration: 12000 })
      return false
    }
    setErrors({})
    toast.success([success, ...(result.messages ?? [])].join(' '))
    router.refresh()
    return true
  }

  const run = async (key: string, path: string, body: unknown, success: string) => {
    setBusy(key)
    const result = await postJson(path, body)
    setBusy(null)
    return done(result, success)
  }

  const saveBilling = (finalise: boolean) =>
    run(
      finalise ? 'finalise' : 'billing',
      `orders/${order.id}/billing`,
      {
        vouchers: vouchers.map((v) => ({
          code: v.code,
          amount: v.amount === '' ? null : v.amount,
          note: v.note,
        })),
        invoiceNumber: invoice.trim() || null,
        internalNote: note,
        finalise,
      },
      finalise ? 'Vyúčtování potvrzeno.' : 'Uloženo.',
    )

  // Stage 7: what this order already redeemed per voucher (counts as available when editing).
  const savedAmount = (code: string) => {
    const key = code.toUpperCase().replace(/[^0-9A-Z]/g, '')
    return order.vouchers
      .filter((v) => v.code.toUpperCase().replace(/[^0-9A-Z]/g, '') === key)
      .reduce((sum, v) => sum + v.amount, 0)
  }
  const setVoucher = (index: number, patch: Partial<Voucher>) =>
    setVouchers((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)))

  const changeStatus = async (to: OrderStatus) => {
    if (to === 'cancelled') {
      setCancelling(true)
      return
    }
    await run(`status-${to}`, `orders/${order.id}/status`, { to }, 'Stav změněn.')
  }

  const hasShipment = Boolean(order.shipment.packageId)
  const lastSent = (kind: FulfilmentEmailKind) =>
    order.sentEmails.filter((e) => e.kind === kind).at(-1)
  const resendable: FulfilmentEmailKind[] = [
    ...(order.finalised && order.status !== 'cancelled' ? (['final-price'] as const) : []),
    ...(order.status === 'shipped' || order.status === 'delivered' ? (['shipped'] as const) : []),
    ...(order.status === 'ready-for-pickup' || order.status === 'picked-up'
      ? (['ready-for-pickup'] as const)
      : []),
    ...(order.status === 'cancelled' ? (['cancelled'] as const) : []),
  ]

  return (
    <>
      {/* ------------------------------------------------------------ billing */}
      <div className="tf-card" data-testid="billing">
        <h3>Vyúčtování</h3>
        {!order.weighed && (
          <p className="tf-muted">Částky se dopočítají po zvážení všech položek.</p>
        )}
        <div className="tf-grid" style={{ alignItems: 'start' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <h4 style={{ margin: '0 0 8px' }}>Úhrada dárkovým poukazem</h4>
            <p className="tf-small tf-muted" style={{ marginTop: 0 }}>
              Poukaz je způsob platby (ne sleva): cena ani DPH se nemění, jen se sníží částka k
              úhradě.
              {order.voucherCode
                ? ` Zákazník zadal kód: ${order.voucherCode} – stav poukazu se ukáže pod kódem.`
                : ''}
            </p>
            {vouchers.map((v, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div className="tf-voucher" style={{ marginBottom: 4 }}>
                  <div className="tf-field" style={{ margin: 0 }}>
                    <label htmlFor={`v-code-${i}`}>Kód</label>
                    <input
                      data-testid="voucher-code"
                      disabled={closed}
                      id={`v-code-${i}`}
                      onChange={(e) => setVoucher(i, { code: e.target.value })}
                      value={v.code}
                    />
                    {errors[`vouchers.${i}.code`] && (
                      <span className="tf-error">{errors[`vouchers.${i}.code`]}</span>
                    )}
                  </div>
                  <div className="tf-field" style={{ margin: 0 }}>
                    <label htmlFor={`v-amount-${i}`}>Částka (Kč)</label>
                    <input
                      data-testid="voucher-amount"
                      disabled={closed}
                      id={`v-amount-${i}`}
                      inputMode="numeric"
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '')
                        setVoucher(i, { amount: digits ? Number(digits) : '' })
                      }}
                      value={v.amount}
                    />
                    {(errors[`vouchers.${i}.amount`] ||
                      (v.amount !== '' && voucherAmountError(v.amount))) && (
                      <span className="tf-error">
                        {errors[`vouchers.${i}.amount`] ?? voucherAmountError(v.amount)}
                      </span>
                    )}
                  </div>
                  <div className="tf-field" style={{ margin: 0 }}>
                    <label htmlFor={`v-note-${i}`}>Poznámka (kdo ověřil…)</label>
                    <input
                      disabled={closed}
                      id={`v-note-${i}`}
                      onChange={(e) => setVoucher(i, { note: e.target.value })}
                      value={v.note}
                    />
                  </div>
                  <button
                    className="tf-btn tf-btn--danger"
                    disabled={closed}
                    onClick={() => setVouchers((prev) => prev.filter((_, k) => k !== i))}
                    style={{ marginTop: 20 }}
                    type="button"
                  >
                    Odebrat
                  </button>
                </div>
                {!closed && (
                  <VoucherRowCheck
                    code={v.code}
                    alreadyHere={savedAmount(v.code)}
                    onUseAmount={(available) => {
                      const others = vouchers.reduce(
                        (sum, other, k) =>
                          sum + (k === i || other.amount === '' ? 0 : other.amount),
                        0,
                      )
                      const rest =
                        order.totalFinal === null
                          ? available
                          : Math.max(0, order.totalFinal - others)
                      setVoucher(i, { amount: Math.min(available, rest) })
                    }}
                  />
                )}
              </div>
            ))}
            {!closed && (
              <button
                className="tf-btn"
                data-testid="voucher-add"
                onClick={() =>
                  setVouchers((prev) => [
                    ...prev,
                    { code: prev.length ? '' : (order.voucherCode ?? ''), amount: '', note: '' },
                  ])
                }
                type="button"
              >
                + Přidat poukaz
              </button>
            )}
            {errors.vouchers && (
              <p className="tf-error" style={{ color: 'var(--tf-err)' }}>
                {errors.vouchers}
              </p>
            )}
          </div>
          <div>
            <div className="tf-field">
              <label htmlFor="invoice">Číslo faktury (z účetního programu)</label>
              <input
                data-testid="invoice-number"
                disabled={closed}
                id="invoice"
                maxLength={50}
                onChange={(e) => setInvoice(e.target.value)}
                value={invoice}
              />
              {errors.invoiceNumber && <span className="tf-error">{errors.invoiceNumber}</span>}
              {!errors.invoiceNumber && invoiceWarning && (
                <span className="tf-hint-warn">{invoiceWarning}</span>
              )}
              {vsProblem && <span className="tf-hint-warn">{vsProblem}</span>}
            </div>
            <div className="tf-field">
              <label htmlFor="note">Interní poznámka (zákazník ji nevidí)</label>
              <textarea id="note" onChange={(e) => setNote(e.target.value)} value={note} />
            </div>
          </div>
          <div>
            <div className="tf-muted">Celkem po zvážení</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>
              {order.totalFinal === null ? '–' : formatCzk(order.totalFinal)}
            </div>
            {voucherTotal > 0 && <div className="tf-muted">poukazy −{formatCzk(voucherTotal)}</div>}
            <div className="tf-muted" style={{ marginTop: 8 }}>
              K úhradě při převzetí {order.methodType === 'courier' ? '(dobírka)' : ''}
            </div>
            <div
              className="tf-amount"
              data-testid="amount-due"
              style={{ color: overCap ? 'var(--tf-err)' : undefined }}
            >
              {amountDue === null ? '–' : formatCzk(Math.max(0, amountDue))}
            </div>
            {overCap && (
              <p style={{ color: 'var(--tf-err)' }}>Poukazy jsou vyšší než cena objednávky.</p>
            )}
            <p className="tf-small tf-muted">
              {order.finalised ? '✓ Vyúčtování potvrzeno.' : 'Vyúčtování ještě není potvrzené.'}
            </p>
          </div>
        </div>
        {!closed && (
          <div className="tf-row" style={{ marginTop: 12 }}>
            <button
              className="tf-btn"
              data-testid="billing-save"
              disabled={busy !== null || overCap}
              onClick={() => saveBilling(false)}
              type="button"
            >
              {busy === 'billing' ? 'Ukládám…' : 'Uložit'}
            </button>
            <button
              className="tf-btn tf-btn--primary"
              data-testid="billing-finalise"
              disabled={busy !== null || overCap || !order.weighed || order.status === 'received'}
              onClick={() => saveBilling(true)}
              title={order.status === 'received' ? 'Nejdřív musí být objednávka zvážená' : ''}
              type="button"
            >
              {busy === 'finalise'
                ? 'Ukládám…'
                : order.finalised
                  ? 'Uložit a znovu potvrdit vyúčtování'
                  : 'Potvrdit vyúčtování a poslat zákazníkovi cenu'}
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ dispatch */}
      <div className="tf-card" data-testid="dispatch">
        <h3>Doprava</h3>
        {order.methodType === 'courier' && (
          <>
            {carrierMode === 'simulation' && (
              <div className="tf-banner tf-banner--sim">
                Balíkobot v SIMULACI – nic se neodešle, štítek je jen ukázka.
              </div>
            )}
            {carrierMode === 'missing' && (
              <div className="tf-banner tf-banner--err">
                Balíkobot není nastaven (chybí přihlašovací údaje).
              </div>
            )}
            {order.shipment.lastError && !hasShipment && (
              <div className="tf-banner tf-banner--err" data-testid="shipment-error">
                <strong>Balíkobot zásilku odmítl:</strong>
                {order.shipment.lastError.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
            {hasShipment ? (
              <div className="tf-row">
                <span>
                  Zásilka <strong data-testid="tracking-number">{order.trackingNumber}</strong>
                  {order.shipment.handedOverAt
                    ? ' · předáno dopravci'
                    : ' · čeká na předání dopravci'}
                </span>
                <a
                  className="tf-btn"
                  href={`/api/fulfilment/orders/${order.id}/label`}
                  target="_blank"
                  data-testid="label-print"
                >
                  Tisk štítku
                </a>
                {order.trackingUrl && order.shipment.provider !== 'simulation' && (
                  <a className="tf-btn" href={order.trackingUrl} target="_blank" rel="noreferrer">
                    Sledování
                  </a>
                )}
                {!order.shipment.handedOverAt && (
                  <button
                    className="tf-btn tf-btn--danger"
                    disabled={busy !== null}
                    onClick={() =>
                      window.confirm('Zrušit zásilku u Balíkobotu? Štítek přestane platit.') &&
                      run('drop', `orders/${order.id}/shipment/cancel`, {}, 'Zásilka zrušena.')
                    }
                    type="button"
                  >
                    Zrušit zásilku
                  </button>
                )}
              </div>
            ) : (
              <div className="tf-row">
                <button
                  className="tf-btn tf-btn--primary tf-btn--big"
                  data-testid="shipment-create"
                  disabled={
                    busy !== null ||
                    order.status !== 'weighed' ||
                    !order.finalised ||
                    carrierMode === 'missing'
                  }
                  onClick={() =>
                    run('shipment', `orders/${order.id}/shipment`, {}, 'Zásilka vytvořena.')
                  }
                  type="button"
                >
                  {busy === 'shipment' ? 'Vytvářím…' : 'Vytvořit zásilku a štítek'}
                </button>
                {(order.status !== 'weighed' || !order.finalised) && (
                  <span className="tf-muted tf-small">
                    Nejdřív zvážit a potvrdit vyúčtování (dobírka musí být konečná).
                  </span>
                )}
              </div>
            )}
          </>
        )}
        {order.methodType === 'own-delivery' && (
          <p>
            Rozvoz vlastním vozem – bez dopravce. Řidič dostane{' '}
            <a
              href={`/api/fulfilment/print/route?date=${order.scheduledDate ?? ''}`}
              target="_blank"
            >
              rozvozový list dne
            </a>
            . Až vyrazí, klikněte „→ Odesláno“ (nebo v Expedici „Řidič vyráží“ pro celý den).
          </p>
        )}
        {order.methodType === 'pickup' && (
          <p>Osobní odběr – po přípravě nastavte „Připraveno k odběru“, zákazník dostane e-mail.</p>
        )}
      </div>

      {/* ------------------------------------------------------------ status */}
      <div className="tf-card" data-testid="status-actions">
        <h3>Stav objednávky</h3>
        {statuses.length === 0 && <p className="tf-muted">Objednávka je uzavřená.</p>}
        <div className="tf-row">
          {statuses.map((s) => (
            <span key={s.to} style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
              <button
                className={`tf-btn${s.to === 'cancelled' ? ' tf-btn--danger' : s.allowed && s.to !== 'received' ? ' tf-btn--primary' : ''}`}
                data-testid={`status-${s.to}`}
                disabled={busy !== null || (!s.allowed && s.to !== 'cancelled')}
                onClick={() => changeStatus(s.to)}
                title={s.reason ?? ''}
                type="button"
              >
                {s.to === 'received'
                  ? 'Vrátit k vážení'
                  : s.to === 'cancelled'
                    ? 'Zrušit objednávku…'
                    : `→ ${s.label}`}
              </button>
              {!s.allowed && s.to !== 'cancelled' && s.reason && (
                <span className="tf-small tf-muted" style={{ maxWidth: 260 }}>
                  {s.reason}
                </span>
              )}
            </span>
          ))}
        </div>
        {cancelling && (
          <div className="tf-banner tf-banner--err" style={{ marginTop: 12 }}>
            <div className="tf-field" style={{ marginBottom: 8 }}>
              <label htmlFor="cancel-reason" style={{ color: 'var(--theme-text)' }}>
                Důvod zrušení (pošle se zákazníkovi e-mailem)
              </label>
              <textarea
                data-testid="cancel-reason"
                id="cancel-reason"
                onChange={(e) => setReason(e.target.value)}
                value={reason}
              />
            </div>
            <div className="tf-row">
              <button
                className="tf-btn tf-btn--danger"
                data-testid="cancel-confirm"
                disabled={!reason.trim() || busy !== null}
                onClick={async () => {
                  if (
                    await run(
                      'cancel',
                      `orders/${order.id}/status`,
                      { to: 'cancelled', reason },
                      'Objednávka zrušena.',
                    )
                  )
                    setCancelling(false)
                }}
                type="button"
              >
                Zrušit objednávku
              </button>
              <button className="tf-btn" onClick={() => setCancelling(false)} type="button">
                Zpět
              </button>
            </div>
          </div>
        )}
        <p className="tf-small tf-muted" style={{ marginBottom: 0 }}>
          „Doručeno“ / „Vyzvednuto“ se zatím nastavuje ručně.
        </p>
      </div>

      {/* ------------------------------------------------------------ e-mails */}
      <div className="tf-card" data-testid="emails">
        <h3>E-maily zákazníkovi</h3>
        {order.sentEmails.length === 0 ? (
          <p className="tf-muted">
            Zatím žádné (potvrzení objednávky z košíku je v záložce Interní u objednávky).
          </p>
        ) : (
          <table className="tf-table">
            <tbody>
              {order.sentEmails.map((e, i) => (
                <tr key={i}>
                  <td>{e.label}</td>
                  <td style={{ color: e.failed ? 'var(--tf-err)' : undefined }}>
                    {e.status}
                    {e.error ? ` – ${e.error}` : ''}
                  </td>
                  <td className="tf-small tf-muted">{e.at}</td>
                  <td className="tf-small tf-muted">{e.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {resendable.length > 0 && (
          <div className="tf-row" style={{ marginTop: 12 }}>
            {resendable.map((kind) => (
              <button
                className="tf-btn"
                disabled={busy !== null}
                key={kind}
                onClick={() =>
                  window.confirm(
                    `Poslat zákazníkovi e-mail „${FULFILMENT_EMAIL_LABELS[kind]}“${lastSent(kind) ? ' znovu' : ''}?`,
                  ) && run(`email-${kind}`, `orders/${order.id}/email`, { kind }, 'Hotovo.')
                }
                type="button"
              >
                {lastSent(kind) ? 'Poslat znovu' : 'Poslat'}: {FULFILMENT_EMAIL_LABELS[kind]}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
