'use client'

import React, { useState } from 'react'

/**
 * Stage 9: the interactive part of /admin/osobni-udaje (export + anonymisation).
 * Anonymisation is always a two-step action: "Zkontrolovat" (dry run, changes nothing) shows
 * the list, then a checkbox + "Anonymizovat" does it. Irreversible – the texts say so.
 */

type Result = {
  ok: boolean
  message?: string
  dryRun?: boolean
  mode?: 'request' | 'retention'
  orders?: { id: number; orderNumber: string; createdAt: string; status: string }[]
  skipped?: { id: number; orderNumber: string; reason: string }[]
  withdrawals?: number
  integrationJobs?: number
}

const box: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  padding: '1rem 1.25rem',
  marginBottom: '1.5rem',
  maxWidth: 820,
}

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' })

export function PrivacyTool() {
  const [exportEmail, setExportEmail] = useState('')
  const [by, setBy] = useState<'email' | 'age'>('email')
  const [email, setEmail] = useState('')
  const [months, setMonths] = useState('36')
  const [result, setResult] = useState<Result | null>(null)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)

  const request = async (confirm: boolean) => {
    setBusy(true)
    try {
      const response = await fetch('/api/privacy/anonymise', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          by === 'email' ? { email, confirm } : { olderThanMonths: Number(months), confirm },
        ),
      })
      setResult((await response.json()) as Result)
      setSure(false)
    } catch {
      setResult({ ok: false, message: 'Server neodpověděl. Zkuste to znovu.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Export údajů o zákazníkovi</h2>
        <p>
          Na žádost zákazníka (právo na přístup) stáhnete vše, co o jeho e-mailu e-shop uchovává:
          objednávky, odstoupení, zakoupené poukazy, souhlas s newsletterem. Soubor pošlete
          zákazníkovi bezpečnou cestou (ne jako přílohu na neověřenou adresu).
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            // A file download from the API (not a page navigation): a temporary link.
            const link = document.createElement('a')
            link.href = `/api/privacy/export?email=${encodeURIComponent(exportEmail.trim())}`
            link.click()
          }}
          style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}
        >
          <input
            type="email"
            required
            placeholder="e-mail zákazníka"
            value={exportEmail}
            onChange={(event) => setExportEmail(event.target.value)}
            style={{ minWidth: 280, padding: '0.5rem' }}
            aria-label="E-mail zákazníka pro export"
          />
          <button type="submit" className="btn btn--style-secondary btn--size-small">
            Stáhnout export (JSON)
          </button>
        </form>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Anonymizace</h2>
        <p>
          Nahradí jméno, e-mail, telefon, adresu, poznámky a údaje o původu návštěvy. Částky, DPH,
          číslo faktury a položky zůstanou (účetnictví). Objednávky, které ještě nejsou vyřízené, se
          nezmění. <strong>Nelze vrátit zpět.</strong> Nejdřív vždy klikněte na „Zkontrolovat“ – nic
          se tím nezmění.
        </p>
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 0.75rem' }}>
          <label style={{ marginRight: '1.5rem' }}>
            <input
              type="radio"
              checked={by === 'email'}
              onChange={() => {
                setBy('email')
                setResult(null)
              }}
            />{' '}
            Na žádost zákazníka (e-mail)
          </label>
          <label>
            <input
              type="radio"
              checked={by === 'age'}
              onChange={() => {
                setBy('age')
                setResult(null)
              }}
            />{' '}
            Starší objednávky (doba uchování)
          </label>
        </fieldset>
        {by === 'email' ? (
          <input
            type="email"
            placeholder="e-mail zákazníka"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setResult(null)
            }}
            style={{ minWidth: 280, padding: '0.5rem' }}
            aria-label="E-mail zákazníka pro anonymizaci"
          />
        ) : (
          <label>
            Objednávky starší než{' '}
            <input
              type="number"
              min={1}
              value={months}
              onChange={(event) => {
                setMonths(event.target.value)
                setResult(null)
              }}
              style={{ width: 80, padding: '0.5rem' }}
            />{' '}
            měsíců (návrh: 36 – potvrdí právník a účetní)
          </label>
        )}
        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn--style-secondary btn--size-small"
            disabled={busy}
            onClick={() => request(false)}
          >
            Zkontrolovat (nic nemění)
          </button>
        </div>

        {result ? (
          <div style={{ marginTop: '1rem' }} data-testid="privacy-result">
            {!result.ok ? (
              <p style={{ color: 'var(--theme-error-500)' }}>{result.message}</p>
            ) : (
              <>
                <p>
                  {result.dryRun ? 'Zkouška – zatím se nic nezměnilo. ' : 'Hotovo. '}
                  Objednávek k anonymizaci: <strong>{result.orders?.length ?? 0}</strong>,
                  odstoupení: <strong>{result.withdrawals ?? 0}</strong>, záznamů marketingové
                  fronty: <strong>{result.integrationJobs ?? 0}</strong>.
                </p>
                {result.orders?.length ? (
                  <p style={{ fontSize: 13 }}>
                    {result.orders.map((o) => `${o.orderNumber} (${date(o.createdAt)})`).join(', ')}
                  </p>
                ) : null}
                {result.skipped?.length ? (
                  <details>
                    <summary>Přeskočeno: {result.skipped.length}</summary>
                    <ul>
                      {result.skipped.map((s) => (
                        <li key={s.id}>
                          {s.orderNumber}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {result.dryRun &&
                ((result.orders?.length ?? 0) > 0 || (result.withdrawals ?? 0) > 0) ? (
                  <div style={{ marginTop: '0.75rem' }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={sure}
                        onChange={(e) => setSure(e.target.checked)}
                      />{' '}
                      Rozumím, že anonymizace je nevratná.
                    </label>{' '}
                    <button
                      type="button"
                      className="btn btn--style-primary btn--size-small"
                      disabled={!sure || busy}
                      onClick={() => request(true)}
                    >
                      Anonymizovat
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}
