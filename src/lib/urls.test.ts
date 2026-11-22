import { describe, expect, it } from 'vitest'

import {
  absoluteUrl,
  getCleanPath,
  getPublicPath,
  isGlossaryTerm,
  legacyCategorySegment,
  normalizeLegacyPath,
  pathFromSegments,
} from './urls'

describe('normalizeLegacyPath', () => {
  it('keeps a plain path', () => {
    expect(normalizeLegacyPath('/produkty/argentinsky-hovezi-rib-eye-detail-406')).toBe(
      '/produkty/argentinsky-hovezi-rib-eye-detail-406',
    )
  })
  it('strips host, query, fragment and trailing slash', () => {
    expect(normalizeLegacyPath('https://www.terrys.cz/magazin/x-detail-1/?page=2#a')).toBe(
      '/magazin/x-detail-1',
    )
    expect(normalizeLegacyPath('  /doprava-a-platba/ ')).toBe('/doprava-a-platba')
  })
  it('rejects unusable values', () => {
    expect(normalizeLegacyPath('')).toBeNull()
    expect(normalizeLegacyPath(null)).toBeNull()
    expect(normalizeLegacyPath('produkty/x')).toBeNull()
    expect(normalizeLegacyPath('//evil.example/x')).toBeNull()
  })
  it('keeps the root path', () => {
    expect(normalizeLegacyPath('/')).toBe('/')
  })
})

describe('getPublicPath', () => {
  it('uses the legacy URL when the document has one', () => {
    expect(getPublicPath('products', { slug: 'x', legacyUrl: '/produkty/x-detail-406' })).toBe(
      '/produkty/x-detail-406',
    )
    expect(getPublicPath('pages', { slug: 'table', legacyUrl: '/pages/cookies/table.aspx' })).toBe(
      '/pages/cookies/table.aspx',
    )
  })

  it('builds clean paths for new documents', () => {
    expect(getPublicPath('products', { slug: 'picanha' })).toBe('/produkty/detail/picanha')
    expect(getPublicPath('categories', { slug: 'grilovani' })).toBe('/produkty/kategorie/grilovani')
    expect(getPublicPath('articles', { slug: 'a', section: 'magazine' })).toBe('/magazin/clanek/a')
    expect(getPublicPath('articles', { slug: 'a', section: 'academy' })).toBe(
      '/academy-magazin/clanek/a',
    )
    expect(getPublicPath('recipes', { slug: 'r' })).toBe('/recepty/recept/r')
    expect(getPublicPath('pages', { slug: 'o-nas', legacyUrl: '' })).toBe('/stranky/o-nas')
  })

  it('clean paths never look like a legacy content URL', () => {
    // Legacy content URLs have exactly one segment after the section; clean ones have two.
    for (const path of [
      getCleanPath('products', { slug: 'wagyu-98' }),
      getCleanPath('categories', { slug: 'steaky-2' }),
      getCleanPath('articles', { slug: 'x-detail-1', section: 'magazine' }),
      getCleanPath('recipes', { slug: 'y-detail-2' }),
    ]) {
      expect(path?.split('/').filter(Boolean)).toHaveLength(3)
    }
    // …and the proxy never mistakes a clean category path for a legacy one.
    expect(legacyCategorySegment('/produkty/kategorie/steaky-2')).toBeNull()
  })

  it('falls back to the section listing without slug and legacy URL', () => {
    expect(getPublicPath('products', {})).toBe('/produkty')
    expect(getPublicPath('articles', { section: 'academy' })).toBe('/academy')
    expect(getPublicPath('recipes', {})).toBe('/recepty')
  })

  it('encodes unusual slugs', () => {
    expect(getCleanPath('products', { slug: 'a b' })).toBe('/produkty/detail/a%20b')
  })
})

describe('legacyCategorySegment', () => {
  it('recognises old category URLs only', () => {
    expect(legacyCategorySegment('/produkty/argentinske-hovezi-23')).toBe('argentinske-hovezi-23')
    expect(legacyCategorySegment('/produkty/argentinsky-hovezi-rib-eye-detail-406')).toBeNull()
    expect(legacyCategorySegment('/produkty')).toBeNull()
    expect(legacyCategorySegment('/produkty/detail/picanha')).toBeNull()
    expect(legacyCategorySegment('/produkty/bez-cisla')).toBeNull()
    expect(legacyCategorySegment('/magazin/novinky-21')).toBeNull()
  })
})

describe('helpers', () => {
  it('detects glossary terms', () => {
    expect(isGlossaryTerm({ legacyUrl: '/pojmy/rib-eye-detail-775' })).toBe(true)
    expect(isGlossaryTerm({ legacyUrl: '/academy-magazin/x-detail-1' })).toBe(false)
    expect(isGlossaryTerm({})).toBe(false)
  })
  it('builds absolute URLs', () => {
    expect(absoluteUrl('/produkty', 'https://www.terrys.cz')).toBe('https://www.terrys.cz/produkty')
    expect(absoluteUrl('x', 'https://www.terrys.cz')).toBe('https://www.terrys.cz/x')
    expect(absoluteUrl('https://cdn.example/a.png', 'https://www.terrys.cz')).toBe(
      'https://cdn.example/a.png',
    )
  })
  it('joins route segments', () => {
    expect(pathFromSegments(['pages', 'cookies', 'table.aspx'])).toBe('/pages/cookies/table.aspx')
  })
})
