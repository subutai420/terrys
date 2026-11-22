import { describe, expect, it } from 'vitest'

import { lineForSingle, lineForVariant } from './cart/line'
import { CART_STORAGE_KEY, createCartStore, type KeyValueStorage } from './cart/store'
import { ancestorsOf, buildMenu, descendantIds } from './categoryTree'
import {
  buildFacets,
  filterProducts,
  filterQueryString,
  hasActiveFilters,
  paginate,
  parseFilterParams,
  sortProducts,
  toggleFilter,
} from './filters'
import { isoDuration, productJsonLd, serializeJsonLd, websiteJsonLd } from './jsonld'
import { validateNewsletterEmail } from './newsletter'
import { getOpenStatus, openingHoursSpecification, parseRanges, weeklyRows } from './openingHours'
import { buildOriginTiles } from './originTiles'
import {
  defaultVariantIndex,
  estimateRange,
  formatWeight,
  purchaseMode,
  variantOptions,
} from './productView'
import {
  DIACRITICS_FROM,
  DIACRITICS_TO,
  foldDiacritics,
  hasRichText,
  lexicalToPlainText,
  searchTerms,
  truncate,
} from './text'

// ---------------------------------------------------------------------------------- products

const steak = {
  price: 990,
  priceUnit: 'kg' as const,
  availability: 'in-stock' as const,
  variants: [
    { id: 'a', label: '1 kg', kind: 'weight' as const, weightGrams: 1000, sortOrder: 20 },
    { id: 'b', label: '250 g', kind: 'weight' as const, weightGrams: 250, sortOrder: 10 },
    {
      id: 'c',
      label: 'Celý kus',
      kind: 'piece' as const,
      weightGrams: 2500,
      availability: 'sold-out' as const,
    },
  ],
}

describe('productView', () => {
  it('orders variants and estimates prices with the ±15 % range', () => {
    const options = variantOptions(steak)
    expect(options.map((o) => o.label)).toEqual(['250 g', '1 kg', 'Celý kus'])
    expect(options[0].estimate).toBe(248)
    expect(options[0].range).toEqual({ low: 211, high: 285 })
    expect(options[2].purchasable).toBe(false)
    expect(defaultVariantIndex(options)).toBe(0)
  })
  it('sold-out products cannot be bought, variants follow the product', () => {
    const soldOut = { ...steak, availability: 'sold-out' as const }
    expect(variantOptions(soldOut).every((o) => !o.purchasable)).toBe(true)
    expect(purchaseMode(soldOut)).toBe('none')
  })
  it('fixed-price products without variants are bought as one piece', () => {
    expect(
      purchaseMode({ price: 189, priceUnit: 'piece', availability: 'in-stock', variants: [] }),
    ).toBe('single')
    expect(
      purchaseMode({ price: 990, priceUnit: 'kg', availability: 'in-stock', variants: [] }),
    ).toBe('none')
  })
  it('per-100 g prices estimate by weight', () => {
    const options = variantOptions({
      price: 27.9,
      priceUnit: '100g',
      availability: 'in-stock',
      variants: [{ label: '200 g', kind: 'weight', weightGrams: 200 }],
    })
    expect(options[0].estimate).toBe(56)
  })
  it('formats weights and ranges', () => {
    expect(formatWeight(250)).toBe('250 g')
    expect(formatWeight(1500)).toBe('1,5 kg')
    expect(estimateRange(1000)).toEqual({ low: 850, high: 1150 })
  })
})

describe('cart lines and store', () => {
  const info = {
    id: 7,
    title: 'Rib Eye',
    price: 990,
    priceUnit: 'kg' as const,
    url: '/x',
    imageUrl: null,
  }
  it('builds lines only for buyable variants', () => {
    const options = variantOptions(steak)
    expect(lineForVariant(info, options[0])).toMatchObject({
      productId: 7,
      variantId: 'b',
      estimatedPrice: 248,
    })
    expect(lineForVariant(info, options[2])).toBeNull()
    expect(lineForSingle({ ...info, priceUnit: 'piece', price: 189 })).toMatchObject({
      variantId: null,
      estimatedPrice: 189,
    })
  })
  it('adds, merges, counts, persists and removes', () => {
    const data = new Map<string, string>()
    const storage: KeyValueStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    }
    const store = createCartStore(storage)
    let notified = 0
    store.subscribe(() => notified++)
    const line = lineForVariant(info, variantOptions(steak)[0])!
    store.add(line)
    store.add(line)
    store.add({ ...line, variantId: 'a', variantLabel: '1 kg' })
    expect(store.getCount()).toBe(3)
    expect(store.getLines()).toHaveLength(2)
    expect(notified).toBe(3)
    // A second store on the same storage reads the persisted cart.
    expect(createCartStore(storage).getCount()).toBe(3)
    store.setQuantity(7, 'b', 0)
    expect(store.getCount()).toBe(1)
    store.clear()
    expect(data.has(CART_STORAGE_KEY)).toBe(false)
  })
  it('ignores broken storage content', () => {
    const store = createCartStore({
      getItem: () => '{not json',
      setItem: () => {},
      removeItem: () => {},
    })
    expect(store.getLines()).toEqual([])
  })
})

// ---------------------------------------------------------------------------------- filters

const term = (slug: string, name = slug) => ({ slug, name })
const products = [
  {
    title: 'Wagyu',
    price: 3890,
    priceUnit: 'kg' as const,
    availability: 'in-stock' as const,
    origin: term('australie'),
    cut: term('rib-eye'),
    usages: [term('grilovani')],
  },
  {
    title: 'Argentinský',
    price: 990,
    priceUnit: 'kg' as const,
    availability: 'sold-out' as const,
    origin: term('argentina'),
    cut: term('rib-eye'),
  },
  {
    title: 'Salám',
    price: 30,
    priceUnit: '100g' as const,
    availability: 'in-stock' as const,
    origin: term('argentina'),
    cut: 7,
  },
]

describe('filters', () => {
  it('parses query parameters (comma lists, repeated keys, junk ignored)', () => {
    const state = parseFilterParams({
      puvod: ['argentina,australie', 'argentina'],
      rez: 'RIB-EYE',
      razeni: 'x',
      strana: '2',
      druh: '<script>',
    })
    expect(state.selected.puvod).toEqual(['argentina', 'australie'])
    expect(state.selected.rez).toEqual(['rib-eye'])
    expect(state.selected.druh).toEqual([])
    expect(state.sort).toBe('doporucene')
    expect(state.page).toBe(2)
  })
  it('filters with OR inside a group and AND across groups', () => {
    expect(filterProducts(products, parseFilterParams({ puvod: 'argentina' }))).toHaveLength(2)
    expect(
      filterProducts(products, parseFilterParams({ puvod: 'argentina', rez: 'rib-eye' })),
    ).toHaveLength(1)
    expect(filterProducts(products, parseFilterParams({ dostupnost: 'skladem' }))).toHaveLength(2)
  })
  it('sorts by price per kg and puts sold-out last by default', () => {
    expect(sortProducts(products, 'cena-vzestupne').map((p) => p.title)).toEqual([
      'Salám',
      'Argentinský',
      'Wagyu',
    ])
    expect(sortProducts(products, 'doporucene').at(-1)?.title).toBe('Argentinský')
  })
  it('builds facets with counts and hides single-value groups', () => {
    const facets = buildFacets(products, parseFilterParams({}))
    expect(facets.find((f) => f.key === 'puvod')?.options).toEqual([
      { value: 'argentina', label: 'argentina', count: 2, selected: false },
      { value: 'australie', label: 'australie', count: 1, selected: false },
    ])
    expect(facets.find((f) => f.key === 'rez')).toBeUndefined()
  })
  it('writes stable query strings and knows when the list is filtered', () => {
    const state = toggleFilter(parseFilterParams({ strana: '3' }), 'puvod', 'argentina')
    expect(filterQueryString(state)).toBe('?puvod=argentina')
    expect(hasActiveFilters(state)).toBe(true)
    expect(hasActiveFilters(parseFilterParams({ strana: '2' }))).toBe(false)
    expect(paginate([1, 2, 3], 9, 2)).toMatchObject({ items: [3], page: 2, totalPages: 2 })
  })
})

// ---------------------------------------------------------------------------------- categories

const cats = [
  { id: 1, title: 'Steaky', parent: null, menuColumn: 'standalone' as const, menuOrder: 10 },
  { id: 2, title: 'Rib Eye', parent: 1, menuColumn: 'cut' as const, menuOrder: 20 },
  { id: 3, title: 'Svíčková', parent: 1, menuColumn: 'cut' as const, menuOrder: 10 },
  { id: 4, title: 'Wagyu Rib Eye', parent: { id: 2 }, menuColumn: null },
]

describe('categoryTree', () => {
  it('builds menu columns sorted by menuOrder', () => {
    const menu = buildMenu(cats)
    expect(menu.columns).toEqual([{ key: 'cut', label: 'Podle řezu', items: [cats[2], cats[1]] }])
    expect(menu.standalone[0].category.title).toBe('Steaky')
  })
  it('falls back to top-level categories when no column is set', () => {
    const menu = buildMenu(cats.map((c) => ({ ...c, menuColumn: null })))
    expect(menu.columns).toEqual([])
    expect(menu.standalone.map((s) => s.category.id)).toEqual([1])
    expect(menu.standalone[0].children.map((c) => c.id)).toEqual([3, 2])
  })
  it('finds ancestors and descendants (and survives cycles)', () => {
    expect(ancestorsOf(cats, cats[3]).map((c) => c.id)).toEqual([1, 2])
    expect(descendantIds(cats, 1).sort()).toEqual([1, 2, 3, 4])
    const cyclic = [
      { id: 1, title: 'a', parent: 2 },
      { id: 2, title: 'b', parent: 1 },
    ]
    expect(ancestorsOf(cyclic, cyclic[0]).map((c) => c.id)).toEqual([2])
  })
})

describe('originTiles', () => {
  it('links a country to the beef category made of its products, not to veal', () => {
    const tiles = buildOriginTiles(
      [
        { id: 1, name: 'Argentina', slug: 'argentina' },
        { id: 2, name: 'Nizozemsko', slug: 'nizozemsko' },
      ],
      [
        { originId: 1, meatTypeSlug: 'hovezi', categoryIds: [10, 99], image: 'a', inStock: true },
        { originId: 1, meatTypeSlug: 'hovezi', categoryIds: [10, 99], image: 'b', inStock: true },
        { originId: 2, meatTypeSlug: 'teleci', categoryIds: [20], image: 'c', inStock: true },
        { originId: 2, meatTypeSlug: 'teleci', categoryIds: [20], image: 'd', inStock: true },
        { originId: 3, meatTypeSlug: 'hovezi', categoryIds: [99], image: 'e', inStock: true },
      ],
      [{ id: 10 }, { id: 20 }, { id: 99 }],
      [10, 20, 99],
    )
    expect(tiles.find((t) => t.originId === 1)?.categoryId).toBe(10)
    expect(tiles.find((t) => t.originId === 2)?.categoryId).toBeNull()
  })
})

// ---------------------------------------------------------------------------------- text, search

describe('text', () => {
  const doc = {
    root: {
      type: 'root',
      children: [
        { type: 'heading', children: [{ type: 'text', text: 'Nadpis' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'První' },
            { type: 'linebreak' },
            { type: 'text', text: 'řádek' },
          ],
        },
      ],
    },
  }
  it('extracts plain text from Lexical', () => {
    expect(lexicalToPlainText(doc)).toBe('Nadpis\nPrvní\nřádek')
    expect(hasRichText(doc)).toBe(true)
    expect(
      hasRichText({ root: { type: 'root', children: [{ type: 'paragraph', children: [] }] } }),
    ).toBe(false)
    expect(lexicalToPlainText(null)).toBe('')
  })
  it('truncates at a word boundary', () => {
    expect(truncate('Jedna dva tři čtyři', 12)).toBe('Jedna dva…')
  })
  it('folds Czech diacritics (svickova finds Svíčková)', () => {
    expect(DIACRITICS_FROM.length).toBe(DIACRITICS_TO.length)
    expect(foldDiacritics('Svíčková ŽEBRA')).toBe('svickova zebra')
    expect(searchTerms('  Svíčková  wagyu% a ')).toEqual(['svickova', 'wagyu'])
    expect(searchTerms('')).toEqual([])
  })
})

// ---------------------------------------------------------------------------------- opening hours

describe('openingHours', () => {
  const hours = {
    monday: '9:30–17:30',
    tuesday: '9.30 - 17.30',
    wednesday: '9–12, 13–17',
    saturday: 'po domluvě',
    sunday: 'DOPLNIT',
  }
  // 2026-11-23 is a Monday. 10:00 Prague = 09:00 UTC (CET).
  it('says open / closed in Prague time', () => {
    expect(getOpenStatus(hours, new Date('2026-11-23T09:00:00Z'))).toMatchObject({
      kind: 'open',
      closesAt: '17:30',
    })
    expect(getOpenStatus(hours, new Date('2026-11-23T07:00:00Z'))).toMatchObject({
      kind: 'opens-later',
      opensAt: '9:30',
    })
    expect(getOpenStatus(hours, new Date('2026-11-27T09:00:00Z'))).toMatchObject({ kind: 'closed' }) // Friday empty
    expect(getOpenStatus(hours, new Date('2026-11-28T09:00:00Z'))).toMatchObject({ kind: 'text' }) // Saturday text
    expect(getOpenStatus(hours, new Date('2026-11-29T09:00:00Z'))).toMatchObject({ kind: 'closed' }) // placeholder
    expect(getOpenStatus({ note: 'x' }, new Date())).toEqual({ kind: 'unknown' })
  })
  it('parses ranges and builds schema.org specs', () => {
    expect(parseRanges('9–12, 13–17')).toEqual([
      { from: 540, to: 720 },
      { from: 780, to: 1020 },
    ])
    expect(parseRanges('zavřeno')).toBeNull()
    expect(openingHoursSpecification(hours)[0]).toMatchObject({ opens: '09:30', closes: '17:30' })
    expect(weeklyRows({})).toEqual([])
  })
})

// ---------------------------------------------------------------------------------- JSON-LD

describe('jsonld', () => {
  it('represents per-kg pricing as variant offers with a unit price', () => {
    const data = productJsonLd({
      name: 'Rib Eye',
      url: 'https://www.terrys.cz/p',
      images: [],
      price: 990,
      priceUnit: 'kg',
      availability: 'in-stock',
      options: variantOptions(steak),
      deliveryPrice: 229,
      priceNotice: 'Cena je orientační.',
    }) as { offers: Record<string, unknown>[] }
    expect(data.offers).toHaveLength(3)
    expect(data.offers[0]).toMatchObject({
      name: '250 g',
      price: 248,
      priceCurrency: 'CZK',
      availability: 'https://schema.org/InStock',
      priceSpecification: { price: 990, referenceQuantity: { value: 1, unitCode: 'KGM' } },
      shippingDetails: { shippingRate: { value: 229 } },
    })
    expect(data.offers[2].availability).toBe('https://schema.org/OutOfStock')
  })
  it('escapes < in serialised JSON-LD and keeps the old search URL', () => {
    expect(serializeJsonLd({ a: '</script>' })).not.toContain('</script>')
    expect(JSON.stringify(websiteJsonLd({ name: 'T', url: 'https://x' }))).toContain(
      '/vyhledavani?ProductsSearch=',
    )
    expect(isoDuration(90)).toBe('PT1H30M')
    expect(isoDuration(0)).toBeUndefined()
  })
})

describe('newsletter', () => {
  it('validates e-mail addresses', () => {
    expect(validateNewsletterEmail(' Jan@Example.cz ')).toEqual({
      ok: true,
      email: 'jan@example.cz',
    })
    expect(validateNewsletterEmail('')).toMatchObject({ ok: false })
    expect(validateNewsletterEmail('jan@')).toMatchObject({ ok: false })
  })
})
