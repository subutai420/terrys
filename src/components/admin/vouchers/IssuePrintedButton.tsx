'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { apiText, voucherApi } from './api'

/** "Vystavit kódy tištěných poukazů" on the order screen (stage 7). */
export function IssuePrintedButton({ orderId, missing }: { orderId: number; missing: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <div className="tf-actions">
      <button
        type="button"
        className="tf-btn tf-btn--primary"
        disabled={busy}
        data-testid="issue-printed"
        onClick={async () => {
          setBusy(true)
          const result = await voucherApi(`orders/${orderId}/issue-printed`, {})
          setBusy(false)
          setMessage({ ok: result.ok, text: apiText(result) })
          if (result.ok) router.refresh()
        }}
      >
        Vystavit kódy ({missing} ks)
      </button>
      {message && <span className={message.ok ? 'tf-muted' : 'tf-error'}>{message.text}</span>}
    </div>
  )
}
