import { describe, expect, it } from 'vitest'

import { parseCspReport } from '@/lib/security/cspReport'
import { configFacts, summariseHealth } from '@/ops/health'

import { describeError, formatLogLine } from './log'
import { sentryOptions } from './sentryOptions'
import { isSensitiveKey, scrubEvent, scrubText, scrubValue } from './scrub'

describe('scrubbing personal data', () => {
  it('removes e-mails, phones, tokens, JWTs and query strings from text', () => {
    const text =
      'Order for jana.novakova@example.test, tel. +420 602 123 456 / 777123456 failed at ' +
      'https://www.terrys.cz/objednavka/dekujeme/AbCdEfGhIjKlMnOpQrStUv12?x=1 and ' +
      '/api/gift-vouchers/pdf/ZYXWVUTSRQPONMLKJIHG Authorization: Bearer abcdefghijklmnop ' +
      'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.c2lnbmF0dXJlLXZhbHVl /vyhledavani?ProductsSearch=wagyu'
    const out = scrubText(text)
    expect(out).not.toContain('jana.novakova')
    expect(out).not.toContain('602 123 456')
    expect(out).not.toContain('777123456')
    expect(out).not.toContain('AbCdEfGhIjKlMnOp')
    expect(out).not.toContain('ZYXWVUTSRQ')
    expect(out).not.toContain('abcdefghijklmnop')
    expect(out).not.toContain('eyJhbGci')
    expect(out).not.toContain('wagyu')
    expect(out).toContain('/objednavka/dekujeme/[token]')
    expect(out).toContain('[email]')
    expect(out).toContain('[phone]')
  })

  it('keeps technical values: order numbers, prices, dates, ids', () => {
    expect(scrubText('order 100042 total 1229 Kč on 2026-11-24, status 409')).toBe(
      'order 100042 total 1229 Kč on 2026-11-24, status 409',
    )
  })

  it('filters fields by name, not technical keys', () => {
    expect(isSensitiveKey('customerEmail')).toBe(true)
    expect(isSensitiveKey('contact_phone')).toBe(true)
    expect(isSensitiveKey('accessToken')).toBe(true)
    expect(isSensitiveKey('firstName')).toBe(true)
    expect(isSensitiveKey('ip')).toBe(true)
    expect(isSensitiveKey('orderNumber')).toBe(false)
    expect(isSensitiveKey('errorType')).toBe(false)
    expect(isSensitiveKey('status')).toBe(false)
    expect(
      scrubValue({
        orderNumber: '100042',
        customer: { email: 'a@b.cz', phone: '602123456' },
        note: '',
      }),
    ).toEqual({
      orderNumber: '100042',
      customer: { email: '[filtered]', phone: '[filtered]' },
      note: '',
    })
  })

  it('scrubEvent drops user, cookies, headers, body and query from a Sentry event', () => {
    const event = scrubEvent({
      user: { email: 'a@b.cz', ip_address: '1.2.3.4' },
      server_name: 'host-1',
      request: {
        url: 'https://www.terrys.cz/objednavka/dekujeme/AbCdEfGhIjKlMnOpQrSt?utm=1',
        cookies: { terrys_consent: 'x' },
        headers: { Cookie: 'a=b', 'User-Agent': 'x', 'Content-Type': 'application/json' },
        data: { customer: { email: 'a@b.cz' } },
        query_string: 'email=a@b.cz',
      },
      message: 'failed for a@b.cz',
      exception: { values: [{ value: 'Duplicate key a@b.cz' }] },
      breadcrumbs: [
        { message: 'fetch /api/x?email=a@b.cz', data: { url: '/x?token=1', email: 'a@b.cz' } },
      ],
      extra: { phone: '602123456', orderNumber: '100042' },
      contexts: { runtime: { name: 'node', version: '22' } },
    })
    expect(event.user).toBeUndefined()
    expect(event.server_name).toBeUndefined()
    expect(event.request).toEqual({
      url: 'https://www.terrys.cz/objednavka/dekujeme/[token]?[query]',
      headers: { 'content-type': 'application/json' },
    })
    expect(JSON.stringify(event)).not.toContain('a@b.cz')
    expect(JSON.stringify(event)).not.toContain('602123456')
    expect(event.extra).toEqual({ phone: '[filtered]', orderNumber: '100042' })
    expect(event.contexts).toEqual({ runtime: { name: 'node', version: '22' } })
  })

  it('sentry options switch off all personal data collection', () => {
    const options = sentryOptions('https://k@o1.ingest.de.sentry.io/1', {
      VERCEL_ENV: 'production',
    })
    expect(options.environment).toBe('production')
    expect(options.tracesSampleRate).toBe(0)
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    })
    expect(sentryOptions('x', { SENTRY_TRACES_SAMPLE_RATE: '0.2' }).tracesSampleRate).toBe(0.2)
    expect(sentryOptions('x', { SENTRY_TRACES_SAMPLE_RATE: '5' }).tracesSampleRate).toBe(0)
  })
})

describe('structured logs', () => {
  it('one JSON line with the event and scrubbed fields', () => {
    const line = formatLogLine(
      'warn',
      'order.rejected',
      { error: 'prices-changed', status: 409, email: 'a@b.cz', detail: 'for a@b.cz' },
      new Date('2026-11-23T10:00:00Z'),
    )
    expect(JSON.parse(line)).toEqual({
      ts: '2026-11-23T10:00:00.000Z',
      level: 'warn',
      event: 'order.rejected',
      error: 'prices-changed',
      status: 409,
      email: '[filtered]',
      detail: 'for [email]',
    })
  })

  it('describeError keeps type and message', () => {
    const described = describeError(new TypeError('boom'))
    expect(described.errorType).toBe('TypeError')
    expect(described.detail).toBe('boom')
    expect(describeError('plain').errorType).toBe('NonError')
  })
})

describe('health summary', () => {
  const now = new Date('2026-11-23T10:00:00Z')
  const counts = {
    appliedMigrations: ['a', 'b'],
    jobs: { pending: 0, failed: 2, expired: 0, stuck: 0 },
    emails: { failedOrders7d: 0, failedWithdrawals7d: 0 },
  }
  it('ok when the database is up and every migration is applied (failed jobs retry by themselves)', () => {
    const report = summariseHealth({
      now,
      dbOk: true,
      latencyMs: 3,
      expectedMigrations: ['a', 'b'],
      counts,
    })
    expect(report.status).toBe('ok')
    expect(report.problems).toEqual([])
  })
  it('down with pending migrations or no database', () => {
    expect(
      summariseHealth({
        now,
        dbOk: true,
        latencyMs: 3,
        expectedMigrations: ['a', 'b', 'c'],
        counts,
      }),
    ).toMatchObject({ status: 'down', migrations: { pending: ['c'] } })
    expect(
      summariseHealth({
        now,
        dbOk: false,
        latencyMs: null,
        expectedMigrations: ['a'],
        counts: null,
      }),
    ).toMatchObject({ status: 'down', problems: ['database-unreachable'] })
  })
  it('degraded on expired jobs or failed e-mails', () => {
    const report = summariseHealth({
      now,
      dbOk: true,
      latencyMs: 3,
      expectedMigrations: ['a', 'b'],
      counts: {
        ...counts,
        jobs: { ...counts.jobs, expired: 1 },
        emails: { failedOrders7d: 2, failedWithdrawals7d: 0 },
      },
    })
    expect(report.status).toBe('degraded')
    expect(report.problems).toEqual(['integration-jobs-expired', 'order-emails-failed'])
  })
  it('flags production misconfiguration (no e-mail provider, no Blob on Vercel, no cron secret)', () => {
    const report = summariseHealth({
      now,
      dbOk: true,
      latencyMs: 3,
      expectedMigrations: ['a', 'b'],
      counts,
      config: configFacts({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' }),
    })
    expect(report.status).toBe('degraded')
    expect(report.problems).toEqual([
      'email-provider-missing',
      'media-storage-not-persistent',
      'cron-secret-missing',
    ])
    const fine = configFacts({
      NODE_ENV: 'production',
      VERCEL: '1',
      RESEND_API_KEY: 're_x',
      EMAIL_FROM_ADDRESS: 'objednavky@terrys.cz',
      CRON_SECRET: 'x'.repeat(20),
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_b',
    })
    expect(
      summariseHealth({
        now,
        dbOk: true,
        latencyMs: 3,
        expectedMigrations: ['a', 'b'],
        counts,
        config: fine,
      }).problems,
    ).toEqual([])
  })
})

describe('CSP reports', () => {
  it('parses the legacy and the Reporting API format, cutting URLs to origin + path', () => {
    expect(
      parseCspReport({
        'csp-report': {
          'document-uri': 'https://www.terrys.cz/objednavka/dekujeme/SECRETTOKEN123?x=1',
          'violated-directive': 'script-src-elem',
          'blocked-uri': 'https://evil.example/x.js?id=1',
        },
      }),
    ).toEqual([
      {
        directive: 'script-src-elem',
        blocked: 'https://evil.example/x.js',
        page: 'https://www.terrys.cz/objednavka/dekujeme/[token]',
      },
    ])
    expect(
      parseCspReport([
        {
          type: 'csp-violation',
          body: {
            effectiveDirective: 'img-src',
            blockedURL: 'inline',
            documentURL: 'https://www.terrys.cz/',
          },
        },
      ]),
    ).toEqual([{ directive: 'img-src', blocked: 'inline', page: 'https://www.terrys.cz/' }])
    expect(parseCspReport('nonsense')).toEqual([])
  })
})
