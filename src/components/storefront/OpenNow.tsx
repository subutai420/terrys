'use client'

import { useEffect, useState } from 'react'

import { getOpenStatus, type OpeningHoursInput, openStatusText } from '@/lib/openingHours'

/**
 * "Dnes otevřeno do 17:30 / Dnes zavřeno". Computed in the browser at the moment of viewing,
 * because the page itself is cached (a server-rendered status would go stale). Renders nothing
 * when the location has no opening hours filled in.
 */
export function OpenNow({ hours }: { hours: OpeningHoursInput | null | undefined }) {
  const [text, setText] = useState<{ kind: string; text: string } | null>(null)

  useEffect(() => {
    const update = () => {
      const status = getOpenStatus(hours, new Date())
      const label = openStatusText(status)
      setText(label ? { kind: status.kind, text: label } : null)
    }
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [hours])

  if (!text) return null
  const open = text.kind === 'open'
  return (
    <p
      className={`inline-flex items-center gap-2 font-bold ${open ? 'text-ok' : 'text-brand-red'}`}
      data-testid="open-now"
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 rounded-full ${open ? 'bg-ok' : 'bg-brand-red'}`}
      />
      {text.text}
    </p>
  )
}
