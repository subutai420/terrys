'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/**
 * Stage 9: error page of the storefront (an unexpected error while rendering a page). The server
 * side of the error is logged / sent to Sentry by `src/instrumentation.ts` (onRequestError);
 * here the customer gets a calm message, a retry button and a way to order by phone.
 * `digest` is Next's anonymous error id – staff can find the matching log line with it.
 */
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="wrap py-14">
      <div className="mx-auto max-w-2xl rounded-card bg-white px-6 py-10 text-center sm:px-12">
        <h1 className="text-[1.75rem] sm:text-[2.25rem]">Něco se pokazilo</h1>
        <p className="mt-3 text-muted">
          Stránku se teď nepodařilo zobrazit. Zkuste to prosím znovu za chvíli. Váš košík zůstává
          uložený. Pokud problém trvá, zavolejte nám nebo napište – objednávku přijmeme i tak.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn" onClick={() => reset()}>
            Zkusit znovu
          </button>
          <Link href="/" className="btn btn-ghost">
            Na úvodní stránku
          </Link>
        </div>
        {error.digest ? <p className="mt-6 text-xs text-muted">Kód chyby: {error.digest}</p> : null}
      </div>
    </div>
  )
}
