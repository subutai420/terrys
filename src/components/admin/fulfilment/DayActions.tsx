'use client'

import { toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { postJson } from './api'

const ACTIONS = {
  'create-shipments': {
    label: 'Vytvořit zásilky kurýra',
    confirm: 'Vytvořit zásilky a štítky pro všechny zvážené kurýrní objednávky tohoto dne?',
  },
  'close-batch': {
    label: 'Předat dopravci (uzavřít svoz)',
    confirm:
      'Předat dnešní zásilky dopravci? Potom už je nejde zrušit a zákazníci dostanou e-mail se sledováním.',
  },
  'van-departed': {
    label: 'Řidič vyráží',
    confirm:
      'Označit zvážené objednávky rozvozu jako odeslané a poslat zákazníkům e-mail „vezeme vám objednávku“?',
  },
} as const

type Action = keyof typeof ACTIONS

/** Bulk buttons of the Expedice view for one day (staff/admin). */
export function DayActions({ date, actions }: { date: string; actions: Action[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<Action | null>(null)
  const run = async (action: Action) => {
    if (!window.confirm(ACTIONS[action].confirm)) return
    setBusy(action)
    const result = await postJson(`day/${action}`, { date })
    setBusy(null)
    if (!result.ok) {
      toast.error(result.message ?? 'Akce selhala.')
      return
    }
    const parts = [
      result.done?.length ? `Hotovo: ${result.done.join(', ')}.` : 'Nebylo co zpracovat.',
      result.skipped?.length ? `Přeskočeno: ${result.skipped.join(', ')}.` : '',
      result.failed?.length
        ? `Chyba: ${result.failed.map((f) => `${f.orderNumber} – ${f.message}`).join('; ')}`
        : '',
    ].filter(Boolean)
    if (result.failed?.length) toast.error(parts.join(' '), { duration: 15000 })
    else toast.success(parts.join(' '))
    router.refresh()
  }
  return (
    <>
      {actions.map((action) => (
        <button
          className="tf-btn"
          data-testid={`day-${action}`}
          disabled={busy !== null}
          key={action}
          onClick={() => run(action)}
          type="button"
        >
          {busy === action ? 'Pracuji…' : ACTIONS[action].label}
        </button>
      ))}
    </>
  )
}
