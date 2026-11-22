import { describe, expect, it } from 'vitest'

import {
  anonymisationEligibility,
  anonymisedEmail,
  anonymisedOrderData,
  monthsBetween,
  normaliseEmail,
} from './anonymise'

const now = new Date('2026-11-23T10:00:00Z')

describe('anonymisation rules', () => {
  it('only finished orders, not twice, and only old enough for the retention run', () => {
    const old = '2023-10-01T10:00:00Z'
    expect(
      anonymisationEligibility(
        { status: 'delivered', createdAt: old },
        { now, olderThanMonths: 36 },
      ),
    ).toEqual({ ok: true })
    expect(anonymisationEligibility({ status: 'picked-up', createdAt: old }, { now })).toEqual({
      ok: true,
    })
    expect(
      anonymisationEligibility({ status: 'cancelled', createdAt: now.toISOString() }, { now }),
    ).toEqual({ ok: true })
    expect(anonymisationEligibility({ status: 'weighed', createdAt: old }, { now })).toEqual({
      ok: false,
      reason: 'active',
    })
    expect(
      anonymisationEligibility({ status: 'delivered', createdAt: old, anonymisedAt: old }, { now }),
    ).toEqual({ ok: false, reason: 'already' })
    expect(
      anonymisationEligibility(
        { status: 'delivered', createdAt: '2025-01-01T00:00:00Z' },
        { now, olderThanMonths: 36 },
      ),
    ).toEqual({ ok: false, reason: 'too-recent' })
  })

  it('months between dates', () => {
    expect(monthsBetween(new Date('2023-11-23T00:00:00Z'), now)).toBe(36)
    expect(monthsBetween(new Date('2023-11-24T00:00:00Z'), now)).toBe(35)
  })

  it('replaces personal data and keeps the accounting fields untouched', () => {
    const data = anonymisedOrderData(
      {
        orderNumber: '100042',
        internalNote: 'Paní Nováková volala',
        sentEmails: [{ id: 'x', kind: 'final-price', to: 'jana@example.test', subject: 'S' }],
      },
      { now, reason: 'request', userId: 7 },
    )
    expect(data.customer).toEqual({
      firstName: 'Anonymizováno',
      lastName: 'Anonymizováno',
      email: 'anonymizovano-100042@anonymizovano.invalid',
      phone: '—',
    })
    expect(data.contactEmail).toBe(anonymisedEmail('100042'))
    expect(data.shippingAddress).toEqual({ street: null, city: null, checkNote: null })
    expect(data.internalNote).toBe('[anonymizováno]')
    expect(data.sentEmails[0]).toEqual({
      id: 'x',
      kind: 'final-price',
      to: '[anonymizováno]',
      subject: 'S',
    })
    expect(data.attribution.gclid).toBeNull()
    expect(data.privacy).toEqual({
      anonymisedAt: now.toISOString(),
      anonymisedReason: 'request',
      anonymisedBy: 7,
    })
    // Accounting data is not part of the update at all.
    for (const key of [
      'lines',
      'totals',
      'invoiceNumber',
      'orderNumber',
      'payment',
      'voucherRedemptions',
    ]) {
      expect(data).not.toHaveProperty(key)
    }
    expect(JSON.stringify(data)).not.toMatch(/jana|Nováková/)
  })

  it('normalises e-mails', () => {
    expect(normaliseEmail('  Jana@Example.TEST ')).toBe('jana@example.test')
    expect(normaliseEmail('nope')).toBeNull()
    expect(normaliseEmail(42)).toBeNull()
  })
})
