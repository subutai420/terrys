'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { apiText, voucherApi } from './api'

const todayPrague = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date())

/**
 * Buttons of one row in "Poukazy – platby". Deliberately plain: one big "Zaplaceno" with the day
 * the money arrived (today by default), smaller "Připomenout" / "Zrušit"; for paid rows "Vrátit".
 * Every click shows what happened in words.
 */
export function PaymentActions({
  orderId,
  orderNumber,
  mode,
}: {
  orderId: number
  orderNumber: string
  mode: 'awaiting' | 'paid'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [paidOn, setPaidOn] = useState(todayPrague)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (path: string, body: unknown) => {
    setBusy(true)
    setMessage(null)
    const result = await voucherApi(path, body)
    setBusy(false)
    setMessage({ ok: result.ok, text: apiText(result) || (result.ok ? 'Hotovo.' : 'Chyba.') })
    if (result.ok) router.refresh()
  }

  if (mode === 'paid') {
    return (
      <div className="tf-actions">
        <button
          type="button"
          className="tf-btn"
          disabled={busy}
          data-testid={`undo-paid-${orderNumber}`}
          onClick={() => {
            const reason = window.prompt(
              `Vrátit „Zaplaceno“ u objednávky ${orderNumber}? Napište důvod (např. omyl – jiná platba):`,
              'Omylem označeno',
            )
            if (reason) void run(`orders/${orderId}/unpaid`, { reason })
          }}
        >
          Vrátit (omyl)
        </button>
        {message && <span className={message.ok ? 'tf-muted' : 'tf-error'}>{message.text}</span>}
      </div>
    )
  }

  return (
    <div className="tf-actions" style={{ flexWrap: 'wrap' }}>
      <label className="tf-small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        Platba přišla
        <input
          type="date"
          className="tf-text-input"
          style={{ width: 150 }}
          value={paidOn}
          max={todayPrague()}
          onChange={(event) => setPaidOn(event.target.value)}
          aria-label={`Den platby objednávky ${orderNumber}`}
        />
      </label>
      <button
        type="button"
        className="tf-btn tf-btn--primary"
        disabled={busy}
        data-testid={`mark-paid-${orderNumber}`}
        onClick={() => void run(`orders/${orderId}/paid`, { paidOn })}
      >
        ✓ Zaplaceno
      </button>
      <button
        type="button"
        className="tf-btn"
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Poslat zákazníkovi připomínku platby (objednávka ${orderNumber})?`))
            void run(`orders/${orderId}/remind`, {})
        }}
      >
        Připomenout
      </button>
      <button
        type="button"
        className="tf-btn tf-btn--danger"
        disabled={busy}
        onClick={() => {
          const reason = window.prompt(
            `Zrušit objednávku ${orderNumber} i její poukazy (nezaplaceno)? Napište důvod:`,
            'Nezaplaceno',
          )
          if (reason) void run(`orders/${orderId}/cancel`, { reason })
        }}
      >
        Zrušit…
      </button>
      {message && (
        <span className={message.ok ? 'tf-muted' : 'tf-error'} role="status">
          {message.text}
        </span>
      )}
    </div>
  )
}
