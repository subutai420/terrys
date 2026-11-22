import { describe, expect, it } from 'vitest'

import {
  buildLocation,
  decideRedirect,
  isOldSpace,
  legacyIndex,
  type LegacyIndexData,
  normalizePathShape,
  normalizeRedirectSource,
  normalizeRedirectTarget,
  resolveLegacyPath,
  validateRedirect,
} from './legacy'

const data: LegacyIndexData = {
  served: [
    '/produkty/argentinsky-hovezi-rib-eye-detail-406',
    '/produkty/vlockova-sul-cornisch-100g-detail-1275',
    '/produkty/vysoky-rostenec-rib-eye-106',
    '/produkty/wagyu-98',
    '/produkty/kategorie/nova-kategorie',
    '/magazin/rib-eye-vysoky-rostenec-detail-1053',
    '/academy-magazin/kdo-je-nas-gastronomicky-guru-mirek-grusz-detail-145',
    '/pojmy/rib-eye-detail-775',
    '/recepty/tatarak-detail-1321',
    '/prodejny/prodejna-terrys-steak-praha-detail-382',
    '/tym',
    '/pages/cookies/info.aspx',
  ],
  retired: {
    '/produkty/kureci-kridla-detail-1010': '/produkty/wagyu-98',
  },
  redirects: {
    '/stary-letak': '/produkty/wagyu-98?razeni=cena',
    '/kampan-a': '/kampan-b', // chain: b → wagyu
    '/kampan-b': '/produkty/wagyu-98',
    '/smycka-a': '/smycka-b', // loop
    '/smycka-b': '/smycka-a',
    '/produkty/wagyu-98': '/magazin', // shadowed by a page: never applies
    '/produkty/skryty-detail-1010': '/tym', // owner wins over the retired-product rule
  },
}
const index = legacyIndex(data)
const decide = (url: string, idx: typeof index | null = index) => {
  const u = new URL(url, 'http://localhost')
  return decideRedirect(u.pathname, u.search, idx)
}

describe('normalizePathShape', () => {
  it('removes trailing and double slashes, the category page suffix and a glued old host', () => {
    expect(normalizePathShape('/magazin/')).toBe('/magazin')
    expect(normalizePathShape('//produkty//wagyu-98/')).toBe('/produkty/wagyu-98')
    expect(normalizePathShape('/produkty/wagyu-98/1')).toBe('/produkty/wagyu-98')
    expect(normalizePathShape('/produkty/wagyu-98/12/')).toBe('/produkty/wagyu-98')
    expect(normalizePathShape('/produkty/x-detail-12/3')).toBe('/produkty/x-detail-12/3')
    expect(normalizePathShape('/magazin/terrys.cz/magazin/rib-eye-detail-1053')).toBe(
      '/magazin/rib-eye-detail-1053',
    )
    expect(normalizePathShape('/')).toBe('/')
  })

  it('knows the old address space', () => {
    expect(isOldSpace('/')).toBe(true)
    expect(isOldSpace('/produkty/wagyu-98')).toBe(true)
    expect(isOldSpace('/tym')).toBe(true)
    expect(isOldSpace('/pages/cookies/info.aspx')).toBe(true)
    expect(isOldSpace('/feeds/google.xml')).toBe(false)
    expect(isOldSpace('/objednavka/dekujeme/abc')).toBe(false)
    expect(isOldSpace('/llms.txt')).toBe(false)
  })
})

describe('resolveLegacyPath', () => {
  it('a page that exists is served as it is, even when a redirect is stored for it', () => {
    expect(resolveLegacyPath('/produkty/wagyu-98', index)).toEqual({
      target: '/produkty/wagyu-98',
      rule: 'served',
    })
    expect(resolveLegacyPath('/magazin', index)?.rule).toBe('served') // fixed listing route
  })

  it('same old ID under another slug', () => {
    expect(resolveLegacyPath('/produkty/rib-eye-106', index)).toEqual({
      target: '/produkty/vysoky-rostenec-rib-eye-106',
      rule: 'same-id',
    })
    expect(resolveLegacyPath('/produkty/vlockova-sul-cornisch-detail-1275', index)?.target).toBe(
      '/produkty/vlockova-sul-cornisch-100g-detail-1275',
    )
    expect(resolveLegacyPath('/academy-magazin/kdo-je-detail-145', index)?.target).toBe(
      '/academy-magazin/kdo-je-nas-gastronomicky-guru-mirek-grusz-detail-145',
    )
  })

  it('a hidden product leads to its category (by path and by ID)', () => {
    expect(resolveLegacyPath('/produkty/kureci-kridla-detail-1010', index)).toEqual({
      target: '/produkty/wagyu-98',
      rule: 'retired-product',
    })
    expect(resolveLegacyPath('/produkty/kridla-detail-1010', index)?.rule).toBe('retired-product')
  })

  it('owner redirects win over the rules, chains are followed, loops ignored', () => {
    expect(resolveLegacyPath('/produkty/skryty-detail-1010', index)?.target).toBe('/tym')
    expect(resolveLegacyPath('/stary-letak', index)).toEqual({
      target: '/produkty/wagyu-98?razeni=cena',
      rule: 'owner',
    })
    expect(resolveLegacyPath('/kampan-a', index)).toEqual({
      target: '/produkty/wagyu-98',
      rule: 'owner',
      needsOwner: undefined,
    })
    expect(resolveLegacyPath('/smycka-a', index)).toBeNull()
  })

  it('rubrics and unknown content go to the section listing', () => {
    expect(resolveLegacyPath('/magazin/novinky-21', index)).toEqual({
      target: '/magazin',
      rule: 'rubric',
    })
    expect(resolveLegacyPath('/magazin/chuck-roll-krk-detail-1060', index)).toMatchObject({
      target: '/magazin',
      needsOwner: true,
    })
    expect(resolveLegacyPath('/recepty/hlavni-jidla-31', index)?.target).toBe('/recepty')
    expect(resolveLegacyPath('/pojmy/podle-typu-masa-74', index)?.target).toBe('/pojmy')
    expect(resolveLegacyPath('/academy-magazin', index)?.target).toBe('/academy')
    // Unknown product / category IDs stay a real 404 (no soft-404 mass redirect).
    expect(resolveLegacyPath('/produkty/neznamy-detail-99999', index)).toBeNull()
    expect(resolveLegacyPath('/produkty/neznama-kategorie-999', index)).toBeNull()
    expect(resolveLegacyPath('/obchod/kosik', index)).toEqual({
      target: '/kosik',
      rule: 'old-cart',
    })
    expect(resolveLegacyPath('/muj-ucet', index)?.target).toBe('/')
    expect(resolveLegacyPath('/jidelni-listek', index)?.target).toBe(
      '/prodejny/prodejna-terrys-steak-praha-detail-382',
    )
  })

  it('clean paths and unknown pages are left alone', () => {
    expect(resolveLegacyPath('/magazin/clanek/neexistuje', index)).toBeNull()
    expect(resolveLegacyPath('/neco-neznameho', index)).toBeNull()
  })
})

describe('decideRedirect', () => {
  it('lets existing pages through untouched', () => {
    expect(decide('/produkty/wagyu-98')).toBeNull()
    expect(decide('/produkty/wagyu-98?druh=hovezi&strana=2')).toBeNull()
    expect(decide('/produkty/argentinsky-hovezi-rib-eye-detail-406?varianta=abc')).toBeNull()
    expect(decide('/')).toBeNull()
    expect(decide('/vyhledavani?ProductsSearch=wagyu&page=2')).toBeNull()
  })

  it('drops the old alias parameters and keeps tracking parameters', () => {
    expect(
      decide('/magazin/rib-eye-vysoky-rostenec-detail-1053?page=2&catId=101&list=hide'),
    ).toMatchObject({
      location: '/magazin/rib-eye-vysoky-rostenec-detail-1053',
      rule: 'normalized',
    })
    expect(decide('/produkty?Page=3&utm_source=google&gclid=XYZ')?.location).toBe(
      '/produkty?utm_source=google&gclid=XYZ',
    )
    expect(decide('/?Id=807')?.location).toBe('/')
    expect(decide('/pages/cookies/info.aspx?Lang=cs')?.location).toBe('/pages/cookies/info.aspx')
    expect(decide('/produkty/wagyu-98?druh_masa=svickova')?.location).toBe('/produkty/wagyu-98')
  })

  it('handles case, trailing slash and the page suffix in one hop', () => {
    expect(decide('/magazin/?Id=807')?.location).toBe('/magazin')
    expect(decide('/Tym/')?.location).toBe('/tym')
    expect(decide('/produkty/wagyu-98/1')?.location).toBe('/produkty/wagyu-98')
    expect(decide('/produkty/rib-eye-106/2?fbclid=1')?.location).toBe(
      '/produkty/vysoky-rostenec-rib-eye-106?fbclid=1',
    )
    expect(
      decide('/magazin/terrys.cz/magazin/rib-eye-vysoky-rostenec-detail-1053?page=3&list=hide')
        ?.location,
    ).toBe('/magazin/rib-eye-vysoky-rostenec-detail-1053')
  })

  it('merges the target query with kept parameters', () => {
    expect(decide('/stary-letak?utm_medium=print&razeni=nazev')?.location).toBe(
      '/produkty/wagyu-98?razeni=cena&utm_medium=print',
    )
    expect(buildLocation('/x', new URLSearchParams())).toBe('/x')
  })

  it('never redirects to itself and leaves unknown addresses to the 404', () => {
    expect(decide('/neco-neznameho')).toBeNull()
    expect(decide('/neco-neznameho/')?.location).toBe('/neco-neznameho')
    expect(decide('/feeds/google.xml')).toBeNull()
  })

  it('without the table only fixes slashes', () => {
    expect(decide('/produkty/rib-eye-106', null)).toBeNull()
    expect(decide('/magazin/x-detail-1?list=hide', null)).toBeNull()
    expect(decide('/tym/', null)?.location).toBe('/tym')
  })
})

describe('admin validation', () => {
  it('normalises sources and targets', () => {
    expect(normalizeRedirectSource('https://www.terrys.cz/Produkty/Stary-Detail-1/')).toEqual({
      path: '/produkty/stary-detail-1',
    })
    expect(normalizeRedirectSource('/x?page=2')).toHaveProperty('error')
    expect(normalizeRedirectSource('/')).toHaveProperty('error')
    expect(normalizeRedirectSource('/admin/collections/users')).toHaveProperty('error')
    expect(normalizeRedirectSource('produkty/x')).toHaveProperty('error')
    expect(normalizeRedirectTarget('https://www.terrys.cz/produkty/wagyu-98/')).toEqual({
      target: '/produkty/wagyu-98',
    })
    expect(normalizeRedirectTarget('/produkty?druh=hovezi')).toEqual({
      target: '/produkty?druh=hovezi',
    })
    expect(normalizeRedirectTarget('https://example.com/x')).toHaveProperty('error')
    expect(normalizeRedirectTarget('https://shop.example/x', ['shop.example'])).toEqual({
      target: '/x',
    })
  })

  it('refuses shadowing, self-redirects, chains and missing targets', () => {
    expect(validateRedirect('/stary-detail-1', '/produkty/wagyu-98', index)).toBeNull()
    expect(validateRedirect('/tym', '/produkty/wagyu-98', index)?.field).toBe('from')
    expect(validateRedirect('/x-1', '/x-1', index)?.field).toBe('to')
    const chain = validateRedirect('/novy', '/produkty/rib-eye-106', index)
    expect(chain?.field).toBe('to')
    expect(chain?.message).toContain('/produkty/vysoky-rostenec-rib-eye-106')
    expect(validateRedirect('/novy', '/kampan-a', index)?.field).toBe('to') // to a redirect source
    expect(validateRedirect('/novy', '/neexistuje', index)?.field).toBe('to')
  })
})
