'use server'

import { headers } from 'next/headers'

import { enqueue, processJobs, runAfterResponse } from '@/integrations/jobs'
import { ecomailConfig } from '@/integrations/config'
import type { EcomailJobPayload } from '@/integrations/senders'
import { NEWSLETTER_CONSENT_TEXT, validateNewsletterEmail } from '@/lib/newsletter'
import { clientIp, createRateLimiter } from '@/lib/orders/rateLimit'
import { getPayloadClient } from '@/storefront/data'

export type NewsletterState = {
  status: 'idle' | 'ok' | 'error'
  message: string
}

const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 })

/**
 * Newsletter signup (footer form), stage 6: the address goes to Ecomail with DOUBLE OPT-IN –
 * Ecomail e-mails a confirmation link and the contact stays "unconfirmed" until it is clicked
 * (the Czech/EU proof of consent for a form anyone can type any address into). The call is queued
 * in `integration-jobs` (with the consent text and time as evidence) and sent right after the
 * response; a failure is retried by the cron. Without Ecomail keys (development) nothing is sent
 * and nothing is stored. The address is never logged.
 */
export async function subscribeNewsletter(
  _previous: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  // Honeypot: real visitors never fill the hidden field.
  if (String(formData.get('company') ?? '').trim()) {
    return { status: 'ok', message: 'Děkujeme, přihlášení k odběru jsme přijali.' }
  }
  const result = validateNewsletterEmail(formData.get('email'))
  if (!result.ok) return { status: 'error', message: result.message }

  const requestHeaders = await headers()
  if (process.env.RATE_LIMIT_DISABLED !== '1' && !limiter.hit(clientIp(requestHeaders))) {
    return { status: 'error', message: 'Příliš mnoho pokusů. Zkuste to prosím za pár minut.' }
  }

  if (!ecomailConfig()) {
    console.info('[newsletter] signup received, Ecomail not configured – nothing sent')
  } else {
    try {
      const payload = await getPayloadClient()
      const job: EcomailJobPayload = {
        email: result.email,
        source: 'web-paticka',
        tags: ['web-paticka'],
        updateExisting: false,
        consentText: NEWSLETTER_CONSENT_TEXT,
        consentAt: new Date().toISOString(),
      }
      const id = await enqueue(payload, { kind: 'ecomail-subscribe', payload: job })
      await runAfterResponse(payload, () => processJobs(payload, [id]))
    } catch (error) {
      console.error(`[newsletter] could not queue the signup: ${String(error)}`)
      return {
        status: 'error',
        message: 'Přihlášení se teď nepodařilo. Zkuste to prosím za chvíli znovu.',
      }
    }
  }
  return {
    status: 'ok',
    message:
      'Děkujeme! Poslali jsme vám e-mail s odkazem – odběr potvrďte kliknutím na něj (zkontrolujte i hromadnou poštu).',
  }
}
