/** Newsletter signup (pure, unit-tested in `newsletter.test.ts`). */

/** Shown next to the footer form and stored with every signup as evidence (stage 6). */
export const NEWSLETTER_CONSENT_TEXT =
  'Souhlasím se zasíláním e-mailů s novinkami a recepty od Terrys. Souhlas mohu kdykoli odvolat ' +
  'odkazem v každém e-mailu. Odběr je potřeba potvrdit v e-mailu, který vám pošleme.'

export function validateNewsletterEmail(
  value: unknown,
): { ok: true; email: string } | { ok: false; message: string } {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!email) return { ok: false, message: 'Vyplňte prosím e-mailovou adresu.' }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, message: 'Zkontrolujte prosím e-mailovou adresu, nevypadá správně.' }
  }
  return { ok: true, email }
}
