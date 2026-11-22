import type { Metadata } from 'next'
import { connection } from 'next/server'

import { Breadcrumbs } from '@/components/storefront/Breadcrumbs'
import { WithdrawalForm } from '@/components/storefront/checkout/WithdrawalForm'
import { findPageLink } from '@/components/storefront/Header'
import { publicText } from '@/lib/openingHours'
import { TERMS_PATH, WITHDRAWAL_PATH } from '@/lib/orders/constants'
import { createFormToken } from '@/lib/orders/formToken'
import { turnstileEnabled } from '@/orders/turnstile'
import { WITHDRAWAL_TOKEN_PURPOSE } from '@/orders/withdrawal'
import { getPayloadClient, getSettings } from '@/storefront/data'

/**
 * Online withdrawal from the contract (stage 4), linked from the footer of every page.
 * Neutral wording on purpose: which goods the right covers is the owner's legal text in the
 * terms (perishable food is excluded by law, durable goods are not). See CLAUDE.md.
 */

export const metadata: Metadata = {
  title: 'Odstoupení od smlouvy',
  description: 'Online formulář pro odstoupení od kupní smlouvy uzavřené v e-shopu Terrys.',
  alternates: { canonical: WITHDRAWAL_PATH },
}

export default async function WithdrawalPage() {
  await connection()
  const [payload, settings, terms] = await Promise.all([
    getPayloadClient(),
    getSettings(),
    findPageLink(TERMS_PATH),
  ])
  const email = publicText(settings.contact?.email)
  return (
    <div className="wrap max-w-3xl pb-16">
      <Breadcrumbs items={[{ name: 'Odstoupení od smlouvy', href: WITHDRAWAL_PATH }]} />
      <h1 className="pb-4 text-[2rem] sm:text-[2.5rem]">Odstoupení od smlouvy</h1>
      <div className="prose-terrys mb-6">
        <p>
          Nakoupili jste u nás jako spotřebitel a chcete od kupní smlouvy odstoupit? Tady to můžete
          udělat online. Vyplníte jen údaje, podle kterých objednávku najdeme; důvod uvádět
          nemusíte. Hned potom vám e-mailem pošleme potvrzení s obsahem odstoupení a časem odeslání.
        </p>
        <p>
          Kdy lze od smlouvy odstoupit a jak se vrací zboží a peníze, popisují{' '}
          <a href={terms?.href ?? TERMS_PATH}>obchodní podmínky</a>. Zákon odstoupení vylučuje mimo
          jiné u zboží, které podléhá rychlé zkáze.
          {email ? (
            <>
              {' '}
              Odstoupit můžete i jinak, například e-mailem na{' '}
              <a href={`mailto:${email}`}>{email}</a>.
            </>
          ) : null}
        </p>
      </div>
      <WithdrawalForm
        formToken={createFormToken(payload.secret, WITHDRAWAL_TOKEN_PURPOSE)}
        turnstileSiteKey={
          turnstileEnabled() ? (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null) : null
        }
      />
    </div>
  )
}
