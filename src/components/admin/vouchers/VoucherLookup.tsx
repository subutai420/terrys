'use client'

import React, { useState } from 'react'

import { apiText, voucherApi, type VoucherViewData } from './api'

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`
const day = (iso: string | null) => {
  if (!iso) return '–'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)}. ${Number(m)}. ${y}`
}
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }) : '–'

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'err' }> = {
  issued: { label: 'Čeká na zaplacení – zatím NEPLATÍ', tone: 'warn' },
  paid: { label: 'Zaplacen – platný', tone: 'ok' },
  'partially-redeemed': { label: 'Částečně uplatněn – platný', tone: 'ok' },
  redeemed: { label: 'Uplatněn celý – nelze použít', tone: 'err' },
  cancelled: { label: 'Zrušený – nelze použít', tone: 'err' },
  expired: { label: 'Propadlý (po platnosti) – nelze použít', tone: 'err' },
}
const TYPE: Record<string, string> = {
  electronic: 'elektronický',
  printed: 'tištěný',
  legacy: 'starý poukaz (starý e-shop)',
}

/** One voucher card: status, value, balance, expiry, where it was used, history. */
export function VoucherCard({ voucher }: { voucher: VoucherViewData }) {
  const status = STATUS[voucher.status] ?? { label: voucher.status, tone: 'warn' as const }
  return (
    <div className="tf-card" data-testid="voucher-card">
      <div className={`tf-banner tf-banner--${status.tone}`} data-testid="voucher-status">
        <strong style={{ fontSize: 18, letterSpacing: 1 }}>{voucher.code}</strong> – {status.label}
      </div>
      <table className="tf-table">
        <tbody>
          <tr>
            <th>Hodnota</th>
            <td>{czk(voucher.value)}</td>
            <th>Zbývá</th>
            <td data-testid="voucher-balance">
              <strong>{czk(voucher.balance)}</strong>
            </td>
          </tr>
          <tr>
            <th>Platnost do</th>
            <td>{day(voucher.expiresOn)}</td>
            <th>Druh</th>
            <td>{TYPE[voucher.type] ?? voucher.type}</td>
          </tr>
          <tr>
            <th>Koupeno</th>
            <td>
              {voucher.orderId ? (
                <a href={`/admin/collections/orders/${voucher.orderId}`}>
                  obj. {voucher.orderNumber}
                </a>
              ) : (
                '–'
              )}
            </td>
            <th>Zaplaceno</th>
            <td>{when(voucher.paidAt)}</td>
          </tr>
        </tbody>
      </table>
      {voucher.redemptions.length > 0 && (
        <>
          <h3>Kde se poukazem platilo</h3>
          <ul>
            {voucher.redemptions.map((r, i) => (
              <li key={i}>
                {r.orderId ? (
                  <a href={`/admin/vyrizeni/${r.orderId}`}>obj. {r.orderNumber}</a>
                ) : (
                  r.orderNumber
                )}
                : {czk(r.amount)} ({when(r.at)})
              </li>
            ))}
          </ul>
        </>
      )}
      <details>
        <summary>Historie</summary>
        <ul>
          {voucher.history.map((h, i) => (
            <li key={i}>
              {when(h.at)} – {h.note ?? h.event}
            </li>
          ))}
        </ul>
      </details>
      <p className="tf-small">
        <a href={`/api/gift-vouchers/${voucher.id}/pdf`} target="_blank" rel="noopener">
          PDF poukazu
        </a>{' '}
        · <a href={`/admin/collections/vouchers/${voucher.id}`}>Otevřít záznam</a>
      </p>
    </div>
  )
}

/**
 * "Najít poukaz": type the code as it is written (spaces, dashes, lowercase do not matter).
 * Plus the forms for OLD-shop vouchers: one by hand, or a CSV export from the old system.
 */
export function VoucherLookup() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VoucherViewData[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const search = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setBusy(true)
    const result = await voucherApi<VoucherViewData[]>(`search?q=${encodeURIComponent(query)}`)
    setBusy(false)
    if (!result.ok) {
      setMessage(apiText(result))
      return
    }
    setResults(result.data ?? [])
    setMessage(result.data?.length ? null : 'Poukaz s tímto kódem v evidenci není.')
  }

  return (
    <section className="tf-card" aria-labelledby="lookup-heading">
      <h2 id="lookup-heading">Najít poukaz podle kódu</h2>
      <form onSubmit={search} className="tf-row" style={{ gap: 8 }}>
        <input
          className="tf-text-input"
          style={{ maxWidth: 320, textTransform: 'uppercase' }}
          placeholder="např. K7MQ 3XPA 9TC R4W"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Kód poukazu"
          data-testid="voucher-search-input"
        />
        <button
          type="submit"
          className="tf-btn tf-btn--primary"
          disabled={busy || query.trim().length < 3}
        >
          Hledat
        </button>
      </form>
      {message && <p className="tf-muted">{message}</p>}
      {results?.map((voucher) => (
        <VoucherCard key={voucher.id} voucher={voucher} />
      ))}
      <LegacyVoucherForm initialCode={results && results.length === 0 ? query : ''} />
      <LegacyImport />
    </section>
  )
}

/** Records one voucher of the OLD shop (so it can be redeemed like ours). */
export function LegacyVoucherForm({
  initialCode = '',
  onCreated,
}: {
  initialCode?: string
  onCreated?: (voucher: VoucherViewData) => void
}) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(initialCode)
  const [value, setValue] = useState('')
  const [balance, setBalance] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  if (!open) {
    return (
      <p>
        <button
          type="button"
          className="tf-btn"
          onClick={() => {
            setCode(initialCode || code)
            setOpen(true)
          }}
          data-testid="legacy-open"
        >
          + Zapsat starý poukaz (ze starého e-shopu)
        </button>
      </p>
    )
  }
  const submit = async () => {
    const result = await voucherApi<VoucherViewData>('legacy', {
      code,
      value: Number(value),
      balance: balance === '' ? null : Number(balance),
      expiresOn,
      note,
    })
    setMessage({ ok: result.ok, text: apiText(result) })
    if (result.ok && result.data) {
      onCreated?.(result.data)
      setOpen(false)
    }
  }
  return (
    <div className="tf-card" data-testid="legacy-form">
      <h3>Starý poukaz ze starého e-shopu</h3>
      <p className="tf-small">
        Opište údaje z poukazu (nebo ze starého systému). Poukaz se zapíše jako zaplacený a půjde
        uplatnit jako náš.
      </p>
      <div className="tf-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="tf-field">
          Kód
          <input
            className="tf-text-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="legacy-code"
          />
        </label>
        <label className="tf-field">
          Hodnota (Kč)
          <input
            className="tf-text-input"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="legacy-value"
          />
        </label>
        <label className="tf-field">
          Zbývá (Kč, prázdné = celá)
          <input
            className="tf-text-input"
            inputMode="numeric"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </label>
        <label className="tf-field">
          Platnost do
          <input
            type="date"
            className="tf-text-input"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            data-testid="legacy-expires"
          />
        </label>
        <label className="tf-field" style={{ minWidth: 240 }}>
          Poznámka
          <input className="tf-text-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="tf-actions">
        <button
          type="button"
          className="tf-btn tf-btn--primary"
          onClick={() => void submit()}
          data-testid="legacy-save"
        >
          Zapsat poukaz
        </button>
        <button type="button" className="tf-btn" onClick={() => setOpen(false)}>
          Zavřít
        </button>
        {message && <span className={message.ok ? 'tf-muted' : 'tf-error'}>{message.text}</span>}
      </div>
    </div>
  )
}

function LegacyImport() {
  const [message, setMessage] = useState<string | null>(null)
  return (
    <details>
      <summary>Hromadně nahrát staré poukazy (CSV)</summary>
      <p className="tf-small">
        Soubor CSV (oddělovač ; nebo ,), první řádek:{' '}
        <code>kod;hodnota;zbyva;platnost_do;poznamka</code>. Datum jako 2027-12-31 nebo 31. 12.
        2027. Sloupec „zbyva“ je nepovinný. Kódy, které už v evidenci jsou, se přeskočí.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          const csv = await file.text()
          const result = await voucherApi<{ created: number; skipped: number; errors: string[] }>(
            'import',
            { csv },
          )
          setMessage([apiText(result), ...(result.data?.errors ?? [])].filter(Boolean).join('\n'))
        }}
      />
      {message && (
        <pre className="tf-small" style={{ whiteSpace: 'pre-wrap' }}>
          {message}
        </pre>
      )}
    </details>
  )
}
