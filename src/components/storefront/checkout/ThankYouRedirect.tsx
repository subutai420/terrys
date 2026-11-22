'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { LAST_ORDER_TOKEN_KEY, THANK_YOU_PUBLIC_PATH } from './PurchaseEvent'

/** See `src/app/(frontend)/objednavka/dekujeme/page.tsx`. */
export function ThankYouRedirect() {
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let token: string | null = null
    try {
      token = window.sessionStorage.getItem(LAST_ORDER_TOKEN_KEY)
    } catch {
      token = null
    }
    if (token && /^[A-Za-z0-9_-]{20,80}$/.test(token)) {
      window.location.replace(`${THANK_YOU_PUBLIC_PATH}/${token}`)
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only fallback
      setMissing(true)
    }
  }, [])
  if (!missing) return <p className="card text-muted">Načítáme objednávku…</p>
  return (
    <div className="card text-center">
      <h1 className="text-[1.75rem]">Objednávku jsme přijali</h1>
      <p className="mt-3 text-muted">
        Potvrzení s odkazem na shrnutí objednávky najdete ve svém e-mailu.
      </p>
      <p className="mt-6">
        <Link href="/" className="btn btn-ghost">
          Zpět do obchodu
        </Link>
      </p>
    </div>
  )
}
