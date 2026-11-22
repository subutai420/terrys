'use client'

import React, { useEffect, useState } from 'react'

import { apiText, voucherApi, type VoucherViewData } from './api'
import { LegacyVoucherForm } from './VoucherLookup'

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`
const day = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${Number(d)}. ${Number(m)}. ${y}`
}

const USABLE = ['paid', 'partially-redeemed']
const TEXT: Record<string, string> = {
  issued: 'ZATÍM NEZAPLACEN – nelze uplatnit',
  paid: 'platný',
  'partially-redeemed': 'platný (část už použita)',
  redeemed: 'už celý vyčerpaný',
  cancelled: 'ZRUŠENÝ',
  expired: 'PROPADLÝ (po platnosti)',
}

/**
 * Stage 7: live check of a voucher code on the billing screen ("Vyřízení objednávky"): shows
 * whether the voucher exists, is paid, valid and how much is left – before saving. The server
 * checks the same again when saving (and locks the voucher). Not found → form for an OLD-shop
 * voucher. `alreadyHere` = amount this order already redeemed from it (counts as available).
 */
export function VoucherRowCheck({
  code,
  alreadyHere,
  onUseAmount,
}: {
  code: string
  alreadyHere: number
  onUseAmount: (amount: number) => void
}) {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'found'; voucher: VoucherViewData }
    | { kind: 'missing'; code: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  useEffect(() => {
    const normalized = code.toUpperCase().replace(/[^0-9A-Z]/g, '')
    if (normalized.length < 6) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setState({ kind: 'loading' })
      const result = await voucherApi<VoucherViewData[]>(`search?q=${encodeURIComponent(code)}`)
      if (cancelled) return
      if (!result.ok) setState({ kind: 'error', message: apiText(result) })
      else {
        const exact = (result.data ?? []).find(
          (v) => v.code.replace(/[^0-9A-Z]/g, '') === normalized,
        )
        setState(exact ? { kind: 'found', voucher: exact } : { kind: 'missing', code })
      }
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [code])

  if (state.kind === 'idle') return null
  if (state.kind === 'loading') return <div className="tf-small tf-muted">Ověřuji poukaz…</div>
  if (state.kind === 'error') return <div className="tf-error">{state.message}</div>
  if (state.kind === 'missing') {
    return (
      <div data-testid="voucher-check" data-state="missing">
        <div className="tf-error">
          Poukaz s tímto kódem v evidenci není. Je-li ze STARÉHO e-shopu (a platný), zapište ho:
        </div>
        <LegacyVoucherForm
          initialCode={state.code}
          onCreated={(voucher) => setState({ kind: 'found', voucher })}
        />
      </div>
    )
  }
  const v = state.voucher
  const available = v.balance + alreadyHere
  const usable = USABLE.includes(v.status) || (alreadyHere > 0 && v.status === 'redeemed')
  return (
    <div
      className={usable ? 'tf-small' : 'tf-error'}
      data-testid="voucher-check"
      data-state={usable ? 'ok' : 'bad'}
    >
      {usable ? '✓ ' : '✗ '}
      Poukaz {v.code}: {TEXT[v.status] ?? v.status}, hodnota {czk(v.value)}, zbývá{' '}
      <strong>{czk(available)}</strong>, platí do {day(v.expiresOn)}
      {v.type === 'legacy' ? ' (starý poukaz)' : ''}.{' '}
      {usable && available > 0 ? (
        <button type="button" className="tf-btn" onClick={() => onUseAmount(available)}>
          Použít až {czk(available)}
        </button>
      ) : null}
    </div>
  )
}
