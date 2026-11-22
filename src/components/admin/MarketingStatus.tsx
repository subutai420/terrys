'use client'

import { useEffect, useState } from 'react'

type Status = {
  ok: boolean
  siteUrl: string
  gtm: { enabled: boolean; id: string | null; allowedHosts: string[] }
  integrations: {
    metaCapi: boolean
    metaTestMode: boolean
    heureka: boolean
    ecomail: boolean
    retryCron: boolean
  }
  feeds: {
    channel: string
    url: string
    generatedAt?: string
    items?: number
    products?: number
    excluded?: number
    ms?: number
  }[]
}

const FEED_NAMES: Record<string, string> = {
  google: 'Google Merchant Center',
  meta: 'Meta katalog',
  heureka: 'Heureka.cz',
  zbozi: 'Zboží.cz',
}

const box: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 4,
  padding: '12px 16px',
  marginBottom: 16,
}

function OnOff({ on, label }: { on: boolean; label?: string }) {
  return (
    <strong style={{ color: on ? 'var(--theme-success-500)' : 'var(--theme-elevation-500)' }}>
      {label ?? (on ? 'zapnuto' : 'vypnuto')}
    </strong>
  )
}

/**
 * Stage 6: status panel on top of Nastavení → Marketing (reads `GET /api/marketing/status`,
 * admin only): what env switches on, the GTM hostname allow-list, and the feed URLs with their
 * last generation time and item counts.
 */
export function MarketingStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/marketing/status', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        setStatus((await response.json()) as Status)
      })
      .catch(() => setError('Stav se nepodařilo načíst (jen pro administrátory).'))
  }, [])

  if (error) return <p style={box}>{error}</p>
  if (!status) return <p style={box}>Načítám stav měření…</p>

  return (
    <div>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Měření (nastavuje se v proměnných prostředí serveru)</h3>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>
            Google Tag Manager: <OnOff on={status.gtm.enabled} />
            {status.gtm.id ? ` (${status.gtm.id})` : ''} – načte se jen na doménách:{' '}
            <strong>{status.gtm.allowedHosts.join(', ') || '— žádné —'}</strong>
          </li>
          <li>
            Meta Conversions API: <OnOff on={status.integrations.metaCapi} />
            {status.integrations.metaTestMode ? ' (TESTOVACÍ režim – Test events)' : ''}
          </li>
          <li>
            Heureka Ověřeno zákazníky: <OnOff on={status.integrations.heureka} />
          </li>
          <li>
            Ecomail (newsletter): <OnOff on={status.integrations.ecomail} />
          </li>
          <li>
            Opakování chybných odeslání (cron): <OnOff on={status.integrations.retryCron} />
          </li>
        </ul>
      </div>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Produktové feedy</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>Kanál</th>
              <th>Adresa feedu (zadejte do administrace kanálu)</th>
              <th>Naposledy vytvořen</th>
              <th>Položek</th>
              <th>Produktů</th>
            </tr>
          </thead>
          <tbody>
            {status.feeds.map((feed) => (
              <tr key={feed.channel}>
                <td>{FEED_NAMES[feed.channel] ?? feed.channel}</td>
                <td>
                  <a href={feed.url} target="_blank" rel="noopener noreferrer">
                    {feed.url}
                  </a>
                </td>
                <td>
                  {feed.generatedAt
                    ? new Date(feed.generatedAt).toLocaleString('cs-CZ')
                    : 'zatím nikdy (vytvoří se při prvním stažení)'}
                </td>
                <td>{feed.items ?? '–'}</td>
                <td>
                  {feed.products ?? '–'}
                  {feed.excluded ? ` (vyřazeno ${feed.excluded})` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginBottom: 0, color: 'var(--theme-elevation-500)' }}>
          Feed se po úpravě produktu nebo kategorie vytvoří znovu při dalším stažení, jinak
          nejpozději za hodinu. Heureka a Zboží neobsahují vyprodané varianty.
        </p>
      </div>
    </div>
  )
}
