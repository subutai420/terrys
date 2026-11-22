import fs from 'fs'
import path from 'path'

import { describe, expect, it } from 'vitest'

import { FIXTURES_DIR } from './config'
import { extractArticle, extractCategory, extractMenuTree, extractProduct, extractRecipe, extractStaticPage } from './extract'
import { derivePricing, mapAvailability, priceUnitFromText } from './extract/product'
import { parseIngredient } from './extract/content'
import type { LexicalNode } from './richtext'

/** Saved pages of the old terrys.cz (migration/fixtures), with the URL they came from. */
function fixture(name: string): { html: string; url: string } {
  const html = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8')
  const url = /fixture: (\S+)/.exec(html)?.[1] ?? 'https://www.terrys.cz/'
  return { html, url }
}

const types = (nodes: LexicalNode[] | undefined) => (nodes ?? []).map((n) => n.type)

describe('product extractor', () => {
  it('reads a weighed product with variants, portioning and properties', () => {
    const { html, url } = fixture('product-rib-eye.html')
    const p = extractProduct(html, url)
    expect(p.oldId).toBe(406)
    expect(p.legacyUrl).toBe('/produkty/argentinsky-hovezi-rib-eye-detail-406')
    expect(p.title).toBe('Argentinský hovězí Rib Eye')
    expect(p.price).toBe(990)
    expect(p.priceUnit).toBe('kg')
    expect(p.variants.map((v) => [v.label, v.kind, v.weightGrams])).toEqual([
      ['250 g', 'weight', 250],
      ['500 g', 'weight', 500],
      ['750 g', 'weight', 750],
      ['1 kg', 'weight', 1000],
      ['1,5 kg', 'weight', 1500],
      ['2 kg', 'weight', 2000],
      ['Celý kus', 'piece', 2500],
    ])
    expect(p.portioningOptions).toEqual(['po 250g', 'V celku'])
    expect(p.availability).toBe('in-stock')
    expect(p.originText).toBe('Argentina')
    expect(p.cutText).toBe('Vysoký roštěnec')
    expect(p.chilledOrFrozen).toBe('Chlazené')
    expect(p.agingText).toBe('Vyzrálé')
    expect(p.usages).toEqual(['Steaky', 'Grilování'])
    expect(p.labels).toContain('Bezlepkové')
    expect(p.images).toHaveLength(1)
    expect(p.images[0]).toContain('Filter=042cdaac')
    expect(p.originalPriceDiffers).toEqual([])
    expect(p.categoryOldId).toBe(23)
  })

  it('keeps the short description faithfully and rewrites internal links to legacy paths', () => {
    const { html, url } = fixture('product-rib-eye.html')
    const p = extractProduct(html, url)
    const doc = p.shortDescription.doc
    expect(doc).not.toBeNull()
    expect(p.shortDescription.text).toContain('ikonickým tukovým okem uprostřed')
    expect(p.shortDescription.text).not.toContain('(více)')
    expect(p.shortDescription.internalLinks).toEqual(['/produkty/striploin-nizky-rostenec-108', '/produkty/chuck-krk-110'])
    const json = JSON.stringify(doc)
    expect(json).not.toMatch(/style=|class=/)
    // Bold text survives (format bit 1).
    expect(json).toContain('"text":"ikonickým tukovým okem uprostřed","format":1')
    // The story box becomes the long description with its heading.
    expect(types(p.description.doc?.root.children)[0]).toBe('heading')
  })

  it('derives weights of "1ks" variants from the piece size and the per-kg price', () => {
    const { html, url } = fixture('product-flank-1ks.html')
    const p = extractProduct(html, url)
    expect(p.priceUnit).toBe('kg')
    expect(p.price).toBe(690)
    expect(p.variants).toEqual([{ label: '1ks', kind: 'piece', weightGrams: 500, oldPrice: 345, weightSource: 'piece-size' }])
  })

  it('supports prices per 100 g with count variants', () => {
    const { html, url } = fixture('product-klobasa-100g.html')
    const p = extractProduct(html, url)
    expect(p.priceUnit).toBe('100g')
    expect(p.price).toBe(38)
    // "Velikost kusu 0,2 kg" does not match the piece price (68,40 Kč = 180 g at 38 Kč/100 g):
    // the weight follows the price, so estimates stay what customers paid on the old site.
    expect(p.variants.map((v) => [v.label, v.weightGrams, v.weightSource])).toEqual([
      ['1ks', 180, 'price'],
      ['2ks', 360, 'price'],
      ['3ks', 540, 'price'],
      ['4ks', 720, 'price'],
      ['5ks', 900, 'price'],
    ])
    expect(p.warnings.some((w) => w.includes('neodpovídá ceně'))).toBe(true)
  })

  it('imports fixed-price goods per piece without variants', () => {
    const { html, url } = fixture('product-omacka-ks.html')
    const p = extractProduct(html, url)
    expect(p.priceUnit).toBe('piece')
    expect(p.price).toBe(119)
    expect(p.variants).toEqual([])
  })

  it('recognises a product switched off on the old site', () => {
    const { html, url } = fixture('product-hidden.html')
    const p = extractProduct(html, url)
    expect(p.hiddenOnOldSite).toBe(true)
    expect(p.title).toBe('VALENTÝN promo Wagyu burger POUZE 9.2. - 13.2.2026')
    expect(p.price).toBeUndefined()
    expect(p.images).toEqual([])
  })

  it('maps availability texts', () => {
    expect(mapAvailability('Skladem')).toEqual({ value: 'in-stock', known: true })
    expect(mapAvailability('Na cestě do ČR')).toEqual({ value: 'in-transit', known: true })
    expect(mapAvailability('Vyprodáno').value).toBe('sold-out')
    expect(mapAvailability('Není skladem').value).toBe('sold-out')
    expect(mapAvailability('dle aktuální zásoby').value).toBe('in-stock')
    expect(mapAvailability('něco jiného').known).toBe(false)
  })

  it('reads the price unit and reports variants that do not match the unit price', () => {
    expect(priceUnitFromText('/ 1 kg')).toBe('kg')
    expect(priceUnitFromText('/ 100 g')).toBe('100g')
    expect(priceUnitFromText('/ ks')).toBe('piece')
    expect(priceUnitFromText('/ balení')).toBe('piece')
    const r = derivePricing([{ label: '500g', price: 600 }], { listedPrice: 1000, listedUnit: 'kg' })
    expect(r.variants[0].weightGrams).toBe(500)
    expect(r.warnings[0]).toContain('stojí 600 Kč')
  })
})

describe('category extractor', () => {
  it('reads title, intro, SEO, product links and pagination', () => {
    const { html, url } = fixture('category-rib-eye.html')
    const c = extractCategory(html, url)
    expect(c.oldId).toBe(106)
    expect(c.legacyUrl).toBe('/produkty/vysoky-rostenec-rib-eye-106')
    expect(c.title).toBe('Vysoký roštěnec / Rib Eye')
    expect(c.intro.text).toMatch(/^Šťavnatý steak\?/)
    expect(c.seo.title).toBe('Vysoký roštěnec / Rib Eye')
    expect(c.productLinks).toHaveLength(12)
    expect(c.productLinks).toContain('/produkty/argentinsky-hovezi-rib-eye-detail-406')
    expect(c.paginationLinks).toEqual(['/produkty/vysoky-rostenec-rib-eye-106/2'])
  })

  it('reads the category tree from the left menu', () => {
    const { html, url } = fixture('category-rib-eye.html')
    const tree = extractMenuTree(html, url)
    const steaks = tree.find((n) => n.oldId === 105)
    expect(steaks?.title).toBe('Steaky - řezy')
    expect(steaks?.children.map((c) => c.oldId)).toContain(106)
    expect(tree.find((n) => n.oldId === 98)?.children.map((c) => c.title)).toContain('Wagyu Austrálie')
    expect(steaks?.objectId).toMatch(/^plc:/)
  })
})

describe('content extractors', () => {
  it('reads a magazine article with date, rubric, cover, inline images and gallery', () => {
    const { html, url } = fixture('article-steak.html')
    const a = extractArticle(html, url)
    expect(a.kind).toBe('magazine')
    expect(a.title).toBe('Jak připravit hovězí steak')
    expect(a.publishedAt).toBe('2022-03-09T12:00:00.000Z')
    expect(a.rubric).toBe('Rady a tipy')
    expect(a.coverImage).toContain('Filter=042cdaac')
    const blocks = types(a.content.doc?.root.children)
    expect(blocks).toContain('list')
    expect(blocks.filter((t) => t === 'upload').length).toBeGreaterThanOrEqual(8)
    expect(a.content.externalLinks).toContain('https://www.facebook.com/terryssteaky')
    expect(a.content.internalLinks).toContain('/magazin/propeceni-steaku-rare-medium-well-done-detail-855')
    // "Image 2" placeholders of EasyWeb are replaced by the article title.
    expect(a.content.images.every((i) => !/^Image \d/.test(i.alt))).toBe(true)
    // Social widgets and scripts are gone.
    expect(a.content.text).not.toMatch(/plusone|fb-like/)
  })

  it('reads a glossary term with its products', () => {
    const { html, url } = fixture('glossary-rib-eye.html')
    const a = extractArticle(html, url)
    expect(a.kind).toBe('glossary')
    expect(a.title).toBe('Rib Eye')
    expect(a.content.text).toMatch(/^Steak z vysokého roštěnce/)
    expect(a.relatedProducts).toContain('/produkty/argentinsky-hovezi-rib-eye-detail-406')
  })

  it('reads a recipe with a numbered procedure and step photos', () => {
    const { html, url } = fixture('recipe-reverse-sear.html')
    const r = extractRecipe(html, url)
    expect(r.title).toBe('Příprava Rib Eye steaku reverzní metodou / reverse sear')
    expect(r.perex).toMatch(/^Postup přípravy vysokého roštěnce/)
    expect(r.steps.length).toBeGreaterThan(10)
    expect(r.steps[0].text).toMatch(/^Maso vytáhněte z lednice/)
    expect(r.steps[0].image).toContain('ImageIndex=4')
    expect(r.content.text).toContain('Postup reverzní metody spočívá')
    expect(r.content.text).not.toContain('Maso vytáhněte z lednice')
  })

  it('reads a recipe with an ingredient box and a paragraph procedure', () => {
    const { html, url } = fixture('recipe-burger.html')
    const r = extractRecipe(html, url)
    expect(r.ingredients[0]).toEqual({ amount: '1', unit: 'kg', name: 'farmářského mletého hovězího masa' })
    expect(r.ingredients.map((i) => i.name)).toContain('Na dresink:')
    expect(r.steps).toHaveLength(4)
    expect(r.relatedProducts).toEqual([
      '/produkty/200g-burger-ze-stareneho-hov-masa-s-koriandrem-detail-550',
      '/produkty/hovezi-mlete-maso-solene-detail-548',
    ])
  })

  it('parses ingredient lines', () => {
    expect(parseIngredient('2 lžíce olivového oleje')).toEqual({ amount: '2', unit: 'lžíce', name: 'olivového oleje' })
    expect(parseIngredient('1 vejce')).toEqual({ amount: '1', unit: undefined, name: 'vejce' })
    expect(parseIngredient('sůl')).toEqual({ name: 'sůl' })
  })

  it('reads a static page without the shared header and footer', () => {
    const { html, url } = fixture('static-doprava.html')
    const s = extractStaticPage(html, url)
    expect(s.title).toBe('Doprava a platba')
    expect(s.content.text).toMatch(/^ROZVOZOVÉ OBLASTI A CENA/)
    expect(s.content.text).toContain('229 Kč nezávisle na hodnotě objednávky')
    expect(s.content.text).not.toContain('Nechci, aby mi cokoliv uteklo')
    expect(types(s.content.doc?.root.children)).toEqual(expect.arrayContaining(['heading', 'list', 'paragraph']))
  })
})
