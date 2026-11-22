import { describe, expect, it } from 'vitest'

import { attributionFromVisit, nextAttribution, parseStoredAttribution } from './attribution'

const now = new Date('2026-11-23T10:00:00Z')

describe('attribution', () => {
  it('captures campaign parameters and an external referrer', () => {
    const visit = attributionFromVisit(
      'https://www.terrys.cz/produkty?utm_source=google&utm_medium=cpc&gclid=abc&foo=bar',
      'https://www.google.com/search?q=steak',
      now,
    )
    expect(visit.utmSource).toBe('google')
    expect(visit.gclid).toBe('abc')
    expect(visit.referrer).toBe('https://www.google.com/search')
    expect(visit.landingPage).toBe('/produkty?utm_source=google&utm_medium=cpc&gclid=abc')
    expect(visit.hasCampaign).toBe(true)
  })

  it('ignores our own site as referrer', () => {
    const visit = attributionFromVisit('https://www.terrys.cz/kosik', 'https://www.terrys.cz/', now)
    expect(visit.referrer).toBeUndefined()
    expect(visit.hasCampaign).toBe(false)
  })

  it('keeps the first touch, replaces it only when expired and the new visit has a campaign', () => {
    const first = { utmSource: 'facebook', firstSeenAt: '2026-11-01T00:00:00Z' }
    const visit = attributionFromVisit('https://www.terrys.cz/?utm_source=google', '', now)
    expect(nextAttribution(null, visit, now)).toMatchObject({ utmSource: 'google' })
    expect(nextAttribution(first, visit, now)).toBe(null)
    const old = { utmSource: 'facebook', firstSeenAt: '2026-01-01T00:00:00Z' }
    expect(nextAttribution(old, visit, now)).toMatchObject({ utmSource: 'google' })
    const direct = attributionFromVisit('https://www.terrys.cz/', '', now)
    expect(nextAttribution(old, direct, now)).toBe(null)
  })

  it('parses stored data defensively', () => {
    expect(parseStoredAttribution('nonsense')).toBe(null)
    expect(parseStoredAttribution('{"utmSource":"x","bad":1}')).toEqual({ utmSource: 'x' })
  })
})
