'use client'

import { openConsentSettings } from '@/lib/consent/browser'

/** Footer link "Nastavení soukromí" – re-opens the consent preferences (stage 6). */
export function ConsentSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openConsentSettings}
      className={className}
      data-testid="footer-consent-settings"
    >
      Nastavení soukromí
    </button>
  )
}
