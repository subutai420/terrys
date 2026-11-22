import { describe, expect, it } from 'vitest'

import { checkFormToken, createFormToken } from './formToken'
import { clientIp, createRateLimiter } from './rateLimit'

describe('rate limiter', () => {
  it('allows `limit` hits per window and key', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 })
    expect(limiter.hit('a', 0)).toBe(true)
    expect(limiter.hit('a', 10)).toBe(true)
    expect(limiter.hit('a', 20)).toBe(false)
    expect(limiter.hit('b', 20)).toBe(true)
    expect(limiter.hit('a', 1000)).toBe(true)
  })

  it('reads the client IP from proxy headers', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})

describe('form token (timing trap)', () => {
  const secret = 'test-secret'
  it('accepts a token after the minimum fill time', () => {
    const token = createFormToken(secret, 'checkout', 1_000_000)
    expect(checkFormToken(token, secret, 'checkout', 1_005_000)).toBe('ok')
  })
  it('rejects too fast, expired, forged and other-purpose tokens', () => {
    const token = createFormToken(secret, 'checkout', 1_000_000)
    expect(checkFormToken(token, secret, 'checkout', 1_001_000)).toBe('too-fast')
    expect(checkFormToken(token, secret, 'checkout', 1_000_000 + 25 * 3600_000)).toBe('expired')
    expect(checkFormToken(token, 'other', 'checkout', 1_005_000)).toBe('invalid')
    expect(checkFormToken(token, secret, 'withdrawal', 1_005_000)).toBe('invalid')
    expect(checkFormToken('nonsense', secret, 'checkout', 1_005_000)).toBe('invalid')
  })
})
