import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Timing trap for the checkout and withdrawal forms (server only).
 *
 * The page embeds a token = render time + HMAC signature (PAYLOAD_SECRET). On submit the server
 * checks the signature and that the form was open at least `MIN_FILL_MS` (bots submit
 * instantly) and at most `MAX_AGE_MS` (old tokens are not replayed forever).
 */
export const MIN_FILL_MS = 3_000
export const MAX_AGE_MS = 24 * 60 * 60 * 1000

function sign(timestamp: number, secret: string, purpose: string): string {
  return createHmac('sha256', secret).update(`${purpose}:${timestamp}`).digest('base64url')
}

export function createFormToken(secret: string, purpose: string, now = Date.now()): string {
  return `${now}.${sign(now, secret, purpose)}`
}

export type FormTokenCheck = 'ok' | 'invalid' | 'too-fast' | 'expired'

export function checkFormToken(
  token: string,
  secret: string,
  purpose: string,
  now = Date.now(),
): FormTokenCheck {
  const [rawTime, signature] = token.split('.')
  const timestamp = Number(rawTime)
  if (!Number.isInteger(timestamp) || !signature) return 'invalid'
  const expected = Buffer.from(sign(timestamp, secret, purpose))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid'
  const age = now - timestamp
  if (age < MIN_FILL_MS) return 'too-fast'
  if (age > MAX_AGE_MS) return 'expired'
  return 'ok'
}
