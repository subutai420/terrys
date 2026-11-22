/**
 * Optional Cloudflare Turnstile (bot check) for the checkout and withdrawal forms.
 *
 * Enabled only when BOTH `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (browser widget) and
 * `TURNSTILE_SECRET_KEY` (server verification) are set. Without them the forms work with the
 * honeypot + timing trap + rate limit only.
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

export function turnstileEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY)
}

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!turnstileEnabled()) return true
  if (!token) return false
  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY as string,
      response: token,
    })
    if (ip && ip !== 'unknown') body.set('remoteip', ip)
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    })
    const data = (await response.json()) as { success?: boolean }
    return data.success === true
  } catch {
    // Cloudflare unreachable: do not lose real orders because of it (other checks still apply).
    return true
  }
}
