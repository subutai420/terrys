'use server'

import { validateNewsletterEmail } from '@/lib/newsletter'

export type NewsletterState = {
  status: 'idle' | 'ok' | 'error'
  message: string
}

/**
 * Newsletter signup (footer form). STAGE 6 STUB: validates the address and logs that a signup
 * happened; stage 6 sends it to Ecomail (double opt-in). The e-mail address itself is not logged
 * (personal data).
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
  console.info('[newsletter] signup received (stub, stage 6 will send it to Ecomail)')
  return {
    status: 'ok',
    message: 'Děkujeme! Jakmile spustíme rozesílání, pošleme vám e-mail s potvrzením odběru.',
  }
}
