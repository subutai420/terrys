/** Validation of the newsletter signup (pure, unit-tested in `newsletter.test.ts`). */
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
