import { describe, expect, it } from 'vitest'

import { decideRedirect, legacyIndex, type LegacyIndexData, splitTarget } from '@/lib/redirects/legacy'

import { assertSafeBase, checkRow, type FetchLike, runRedirectCheck, sameSiteLocation } from './redirectCheck'
import { crossCheck, parsePlanCsv, planFor, planToCsv, type PlanRow, renderRedirectReport } from './redirectPlan'
import { aliasBaseUrl } from './urls'

const data: LegacyIndexData = {
  served: [
    '/produkty/vysoky-rostenec-rib-eye-106',
    '/produkty/argentinsky-hovezi-rib-eye-detail-406',
    '/magazin/rib-eye-vysoky-rostenec-detail-1053',
  ],
  retired: { '/produkty/treska-detail-1070': '/produkty/vysoky-rostenec-rib-eye-106' },
  redirects: {},
}
const index = legacyIndex(data)

/** A fake new site: answers like the proxy + routes would (served → 200, redirect → 308). */
function fakeSite(opts: { brokenTarget?: string; chainFrom?: string } = {}): FetchLike {
  return async (url) => {
    const u = new URL(url)
    const respond = (status: number, location?: string) => ({
      status,
      headers: { get: (name: string) => (name === 'location' ? (location ?? null) : null) },
      text: async () => (u.pathname === '/sitemap.xml' ? sitemap : ''),
    })
    if (u.pathname === '/sitemap.xml') return respond(200)
    if (opts.chainFrom && u.pathname === opts.chainFrom) return respond(308, '/produkty')
    const decision = decideRedirect(u.pathname, u.search, index)
    if (decision) return respond(308, `http://localhost:3000${decision.location}`)
    if (opts.brokenTarget === u.pathname) return respond(404)
    const served = index.isServed(splitTarget(u.pathname).path)
    return respond(served ? 200 : 404)
  }
}
const sitemap = `<?xml version="1.0"?><urlset><url><loc>https://www.terrys.cz/produkty/vysoky-rostenec-rib-eye-106</loc></url></urlset>`
const base = new URL('http://localhost:3000')

describe('redirect plan', () => {
  it('plans 200, 308 and 404 rows', () => {
    expect(planFor('/produkty/argentinsky-hovezi-rib-eye-detail-406', index)).toMatchObject({
      expected_status: '200',
      rule: 'served',
    })
    expect(planFor('/produkty/rib-eye-106', index)).toMatchObject({
      expected_status: '308',
      expected_target: '/produkty/vysoky-rostenec-rib-eye-106',
      rule: 'same-id',
    })
    expect(planFor('/produkty/vysoky-rostenec-rib-eye-106/2', index).expected_target).toBe(
      '/produkty/vysoky-rostenec-rib-eye-106',
    )
    expect(planFor('/neco-uplne-jineho', index)).toMatchObject({ expected_status: '404', needs_owner: 'ano' })
  })

  it('cross-checks with the import record', () => {
    expect(crossCheck({ expected_target: '/a?x=1', rule: 'normalized' }, '/a')).toBe('')
    expect(crossCheck({ expected_target: '/b', rule: 'same-id' }, '/a')).toContain('NESOUHLASÍ')
    expect(crossCheck({ expected_target: '/kat', rule: 'retired-product' }, null)).toContain('není veřejný')
    expect(crossCheck({ expected_target: '/kat', rule: 'rubric' }, undefined)).toBe('')
  })

  it('round-trips the CSV and renders the report', () => {
    const rows: PlanRow[] = [
      { ...planFor('/produkty/rib-eye-106?a="b",c', index), source: 'inventory', note: 'x, "y"' },
      { ...planFor('/obchod/kosik', index), source: 'text', note: '' },
    ]
    expect(parsePlanCsv(planToCsv(rows))).toEqual(rows)
    const report = renderRedirectReport(rows, { generatedAt: 'now', database: 'test' })
    expect(report).toContain('Přesměrování starých adres')
    expect(report).toContain('/produkty/vysoky-rostenec-rib-eye-106')
  })
})

describe('redirect checker', () => {
  const rows: PlanRow[] = [
    '/produkty/argentinsky-hovezi-rib-eye-detail-406',
    '/produkty/rib-eye-106',
    '/magazin/rib-eye-vysoky-rostenec-detail-1053?page=2&list=hide',
    '/produkty/treska-detail-1070',
  ].map((url) => ({ ...planFor(url, index), source: 'inventory', note: '' }))

  it('passes when the site behaves as planned (incl. utm probe and sitemap)', async () => {
    const result = await runRedirectCheck({ base, rows, fetchImpl: fakeSite() })
    expect(result.failures).toEqual([])
    expect(result).toMatchObject({ checked: 4, direct: 1, redirected: 3, sitemapChecked: 1 })
  })

  it('reports a chain, a broken target and a wrong target', async () => {
    const chain = await checkRow(rows[1], base, fakeSite({ chainFrom: '/produkty/vysoky-rostenec-rib-eye-106' }))
    expect(chain?.got).toContain('řetězec')
    const broken = await checkRow(rows[2], base, fakeSite({ brokenTarget: '/magazin/rib-eye-vysoky-rostenec-detail-1053' }))
    expect(broken?.got).toBe('404')
    const wrong = await checkRow({ ...rows[1], expected_target: '/jinam' }, base, fakeSite())
    expect(wrong?.expected).toContain('/jinam')
    const notServed = await checkRow({ ...rows[0], old_url: '/neni-tu' }, base, fakeSite())
    expect(notServed?.got).toBe('404')
  })

  it('never leaves the site and refuses the old live host', () => {
    expect(() => assertSafeBase('https://www.terrys.cz')).toThrow()
    expect(() => assertSafeBase('ftp://localhost')).toThrow()
    expect(assertSafeBase('https://www.terrys.cz', true).origin).toBe('https://www.terrys.cz')
    expect(assertSafeBase('http://localhost:3000/x').origin).toBe('http://localhost:3000')
    expect(sameSiteLocation('https://evil.example/x', base)).toBeNull()
    expect(sameSiteLocation('/x?y=1', base)).toBe('/x?y=1')
    expect(sameSiteLocation('/x, /x', base)).toBe('/x')
    expect(sameSiteLocation('/x, /y', base)).toBeNull()
  })
})

describe('crawler gap fix', () => {
  it('enqueues the plain address of a detail page seen only with list parameters', () => {
    expect(aliasBaseUrl('https://www.terrys.cz/magazin/chuck-roll-krk-detail-1060?page=4&list=hide')).toBe(
      'https://www.terrys.cz/magazin/chuck-roll-krk-detail-1060',
    )
    expect(aliasBaseUrl('https://www.terrys.cz/magazin/chuck-roll-krk-detail-1060')).toBeNull()
    expect(aliasBaseUrl('https://www.terrys.cz/produkty/wagyu-98?druh_masa=svickova')).toBeNull()
  })
})
