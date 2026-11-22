'use client'

import { Button, useAuth } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useRef, useState } from 'react'

type Summary = {
  created: number
  updated: number
  unchanged: number
  skipped: number
  errors: { line: number; message: string }[]
  errorCount: number
}

const box: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m, 4px)',
  padding: 'calc(var(--base) * 0.75)',
  marginBottom: 'var(--base)',
}

/**
 * CSV import / export box shown above the postcode list (admins only; the endpoint checks it).
 */
export function PostcodeImport() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth<{ role?: string }>()

  async function upload() {
    const file = input.current?.files?.[0]
    if (!file) {
      setError('Nejdřív vyberte soubor CSV.')
      return
    }
    setBusy(true)
    setError(null)
    setSummary(null)
    try {
      const response = await fetch('/api/postcodes/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'text/csv' },
        body: await file.arrayBuffer(),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.message || `Chyba ${response.status}`)
      setSummary(json as Summary)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import se nepodařil.')
    } finally {
      setBusy(false)
    }
  }

  // Only administrators may import/export (the endpoints check it too).
  if (user?.role !== 'admin') return null

  return (
    <div style={box}>
      <strong>Import a export PSČ (CSV)</strong>
      <p style={{ margin: '0.5em 0' }}>
        Soubor CSV s hlavičkou <code>psc;obec;okres;nedorucujeme</code> (oddělovač středník nebo
        čárka, kódování UTF-8 nebo Windows-1250). Existující PSČ se aktualizují, nová se přidají,
        nic se nemaže. Prázdné buňky nic nepřepisují. Bez sloupce <code>nedorucujeme</code> zůstane
        u PSČ uložená hodnota.
      </p>
      <div style={{ display: 'flex', gap: '1em', alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={input} type="file" accept=".csv,text/csv" aria-label="Soubor CSV s PSČ" />
        <Button buttonStyle="primary" disabled={busy} onClick={upload} size="small">
          {busy ? 'Importuji…' : 'Importovat CSV'}
        </Button>
        <a href="/api/postcodes/export" download>
          Stáhnout všechna PSČ (CSV)
        </a>
      </div>
      {error && <p style={{ color: 'var(--theme-error-500)' }}>{error}</p>}
      {summary && (
        <div role="status" style={{ marginTop: '0.75em' }}>
          <p style={{ margin: 0 }}>
            Hotovo: vytvořeno <strong>{summary.created}</strong>, aktualizováno{' '}
            <strong>{summary.updated}</strong>, beze změny <strong>{summary.unchanged}</strong>,
            přeskočeno (duplicitní řádky) <strong>{summary.skipped}</strong>, chyb{' '}
            <strong>{summary.errorCount}</strong>.
          </p>
          {summary.errors.length > 0 && (
            <ul style={{ color: 'var(--theme-error-500)', margin: '0.5em 0 0' }}>
              {summary.errors.map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  Řádek {e.line}: {e.message}
                </li>
              ))}
              {summary.errorCount > summary.errors.length && (
                <li>… a dalších {summary.errorCount - summary.errors.length} chyb.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
