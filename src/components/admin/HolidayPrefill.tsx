'use client'

import { Button, useAuth } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

const box: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m, 4px)',
  padding: 'calc(var(--base) * 0.75)',
  marginBottom: 'var(--base)',
}

/**
 * Button above the exception list: pre-fill Czech public holidays of a year as "closed"
 * exceptions. Existing ones are not duplicated; past dates are skipped.
 */
export function HolidayPrefill() {
  const router = useRouter()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear + 1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth<{ role?: string }>()

  async function prefill() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/delivery-exceptions/prefill-holidays', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.message || `Chyba ${response.status}`)
      setMessage(
        `Rok ${json.year}: přidáno ${json.created.length} svátků, přeskočeno ${json.skipped} ` +
          '(už zadané nebo v minulosti).',
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Akce se nepodařila.')
    } finally {
      setBusy(false)
    }
  }

  // Same people who may edit exceptions (the endpoint checks it too).
  if (user?.role !== 'admin' && user?.role !== 'staff') return null

  return (
    <div style={box}>
      <strong>Státní svátky</strong>
      <p style={{ margin: '0.5em 0' }}>
        Přidá všechny české státní svátky zvoleného roku (včetně Velkého pátku a Velikonočního
        pondělí) jako „Zavřeno – vše“. Jednotlivé svátky pak můžete upravit nebo smazat.
      </p>
      <div style={{ display: 'flex', gap: '1em', alignItems: 'center' }}>
        <select aria-label="Rok" onChange={(e) => setYear(Number(e.target.value))} value={year}>
          {[0, 1, 2].map((offset) => (
            <option key={offset} value={currentYear + offset}>
              {currentYear + offset}
            </option>
          ))}
        </select>
        <Button buttonStyle="secondary" disabled={busy} onClick={prefill} size="small">
          {busy ? 'Přidávám…' : 'Předvyplnit svátky'}
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p style={{ color: 'var(--theme-error-500)' }}>{error}</p>}
    </div>
  )
}
