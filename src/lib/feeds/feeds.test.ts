import { describe, expect, it } from 'vitest'

import { courierDeliveryId, orderDeliveryId } from './delivery'
import { buildFeedItems, estimateNotice, feedTitle, type FeedProductInput } from './items'
import {
  countRendered,
  type FeedContext,
  renderGoogleFeed,
  renderHeurekaFeed,
  renderMetaFeed,
  renderZboziFeed,
} from './render'
import { assertWellFormedXml } from './xmlCheck'
import { escapeXml } from './xml'

const SITE = 'https://www.terrys.cz'

const ctx: FeedContext = {
  siteUrl: SITE,
  shopName: 'Terrys Steak',
  deliveryPrice: 229,
  courierDeliveryId: 'PPL',
  pickup: true,
  inStockDeliveryDays: 0,
  inTransitDeliveryDays: 7,
  now: new Date('2026-11-23T09:00:00Z'),
}

function product(overrides: Partial<FeedProductInput> = {}): FeedProductInput {
  return {
    id: 406,
    title: 'Argentinský rib eye',
    legacyUrl: '/produkty/argentinsky-hovezi-rib-eye-detail-406',
    price: 990,
    priceUnit: 'kg',
    availability: 'in-stock',
    variants: [
      { id: 'v250', label: '250 g', kind: 'weight', weightGrams: 250 },
      { id: 'v500', label: '500 g', kind: 'weight', weightGrams: 500, availability: 'sold-out' },
    ],
    brand: null,
    description: 'Šťavnatý steak <s mramorováním> & tukem.',
    images: ['/api/media/file/rib.jpg', '/api/media/file/rib-2.jpg'],
    categoryPath: ['Steaky - řezy', 'Rib Eye'],
    categories: {
      google: '4628',
      heureka: 'Heureka.cz | Jídlo a nápoje | Čerstvé potraviny | Maso, drůbež, ryby',
      zbozi: 'Potraviny a nápoje | Potraviny | Maso a ryby',
    },
    excluded: false,
    categoryExcluded: false,
    ...overrides,
  }
}

const sauce = product({
  id: 512,
  title: 'BBQ omáčka',
  legacyUrl: null,
  slug: 'bbq-omacka',
  price: 149,
  priceUnit: 'piece',
  variants: [],
  brand: 'Stubb’s',
})

describe('feed items', () => {
  const { items, excluded } = buildFeedItems(
    [
      product(),
      sauce,
      product({ id: 7, title: 'Bez variant', variants: [] }),
      product({ id: 8, title: 'Vyřazený', excluded: true }),
      product({ id: 9, title: 'Kategorie vyřazena', categoryExcluded: true }),
      product({ id: 10, title: 'Bez fotky', images: [] }),
      product({ id: 11, title: 'Na cestě', availability: 'in-transit' }),
    ],
    SITE,
  )

  it('one item per variant, the product itself when it has none', () => {
    expect(items.map((item) => item.id)).toEqual([
      '406-v250',
      '406-v500',
      '512',
      '11-v250',
      '11-v500',
    ])
    const first = items[0]
    expect(first).toMatchObject({
      groupId: '406',
      title: 'Argentinský rib eye – 250 g',
      price: 248,
      weightGrams: 250,
      pricePerKg: 990,
      availability: 'in-stock',
      brand: 'Terrys',
      link: `${SITE}/produkty/argentinsky-hovezi-rib-eye-detail-406?varianta=v250`,
      imageLink: `${SITE}/api/media/file/rib.jpg`,
      additionalImages: [`${SITE}/api/media/file/rib-2.jpg`],
    })
    expect(items[1].availability).toBe('sold-out')
    expect(items[2]).toMatchObject({
      groupId: null,
      price: 149,
      link: `${SITE}/produkty/detail/bbq-omacka`,
      weightGrams: null,
    })
  })

  it('reports excluded products with the reason', () => {
    expect(excluded.map((e) => [e.productId, e.reason])).toEqual([
      [7, 'cena za kg bez variant – nelze objednat online'],
      [8, 'vyřazen z feedů u produktu'],
      [9, 'vyřazen z feedů v kategorii'],
      [10, 'bez fotky'],
    ])
  })

  it('titles do not repeat a label that is already in the name', () => {
    expect(feedTitle('Rib eye 300 g', '300 g')).toBe('Rib eye 300 g')
    expect(estimateNotice(items[0])).toContain('Cena je odhad za 250 g (990 Kč/kg)')
    expect(estimateNotice(items[2])).toBe('')
  })

  it.each([
    ['google', renderGoogleFeed(items, ctx), 'item', 5],
    ['meta', renderMetaFeed(items, ctx), 'item', 5],
    ['heureka', renderHeurekaFeed(items, ctx), 'SHOPITEM', 3],
    ['zbozi', renderZboziFeed(items, ctx), 'SHOPITEM', 3],
  ] as const)('%s: well-formed XML, no sale price, no free shipping', (_name, xml, tag, count) => {
    assertWellFormedXml(xml)
    expect(countRendered(xml, tag)).toBe(count)
    expect(xml).not.toMatch(/sale_price|SALE_PRICE|coupon|zdarma/i)
    expect(xml).toContain('&lt;s mramorováním&gt; &amp; tukem')
  })

  it('google: required fields, unit pricing, variants, shipping 229, backorder date', () => {
    const xml = renderGoogleFeed(items, ctx)
    const first = xml.slice(xml.indexOf('<item>'), xml.indexOf('</item>'))
    for (const field of [
      'g:id',
      'g:title',
      'g:description',
      'g:link',
      'g:image_link',
      'g:availability',
      'g:price',
      'g:brand',
      'g:condition',
    ]) {
      expect(first).toContain(`<${field}>`)
    }
    expect(first).toContain('<g:price>248.00 CZK</g:price>')
    expect(first).toContain('<g:identifier_exists>no</g:identifier_exists>')
    expect(first).toContain('<g:item_group_id>406</g:item_group_id>')
    expect(first).toContain('<g:size>250 g</g:size>')
    expect(first).toContain('<g:unit_pricing_measure>250 g</g:unit_pricing_measure>')
    expect(first).toContain('<g:unit_pricing_base_measure>1 kg</g:unit_pricing_base_measure>')
    expect(first).toContain('<g:google_product_category>4628</g:google_product_category>')
    expect(first).toContain('<g:product_type>Steaky - řezy &gt; Rib Eye</g:product_type>')
    expect(first).toContain(
      '<g:shipping><g:country>CZ</g:country><g:service>Kurýr / chlazený rozvoz</g:service><g:price>229.00 CZK</g:price></g:shipping>',
    )
    expect(xml).toContain('<g:availability>out_of_stock</g:availability>')
    expect(xml).toContain(
      '<g:availability>backorder</g:availability><g:availability_date>2026-11-30T12:00:00Z</g:availability_date>',
    )
    // the sauce: no unit pricing, no group, own brand
    const sauceXml = xml.slice(xml.indexOf('<g:id>512</g:id>'))
    expect(sauceXml.slice(0, sauceXml.indexOf('</item>'))).not.toMatch(
      /unit_pricing|item_group_id|g:size/,
    )
  })

  it('meta: availability with spaces, unit_price object', () => {
    const xml = renderMetaFeed(items, ctx)
    expect(xml).toContain('<g:availability>in stock</g:availability>')
    expect(xml).toContain('<g:availability>out of stock</g:availability>')
    expect(xml).toContain(
      '<unit_price><value>990.00</value><currency>CZK</currency><unit>kg</unit></unit_price>',
    )
  })

  it('heureka: sellable items only, delivery PPL 229 with COD, estimate in the description', () => {
    const xml = renderHeurekaFeed(items, ctx)
    expect(xml).not.toContain('406-v500')
    expect(xml).toContain('<ITEM_ID>406-v250</ITEM_ID>')
    expect(xml).toContain('<PRICE_VAT>248</PRICE_VAT>')
    expect(xml).toContain('<DELIVERY_DATE>0</DELIVERY_DATE>')
    expect(xml).toContain('<DELIVERY_DATE>7</DELIVERY_DATE>')
    expect(xml).toContain(
      '<DELIVERY><DELIVERY_ID>PPL</DELIVERY_ID><DELIVERY_PRICE>229</DELIVERY_PRICE><DELIVERY_PRICE_COD>229</DELIVERY_PRICE_COD></DELIVERY>',
    )
    expect(xml).toContain('<PARAM><PARAM_NAME>Hmotnost</PARAM_NAME><VAL>250 g</VAL></PARAM>')
    expect(xml).toContain('Cena je odhad za 250 g')
    expect(xml).not.toContain('ITEMGROUP_ID')
    // manufacturer only when it is part of the name
    expect(xml).not.toContain('<MANUFACTURER>')
  })

  it('zboží: namespace, item group, pickup expressed separately at 0', () => {
    const xml = renderZboziFeed(items, ctx)
    expect(xml).toContain('<SHOP xmlns="http://www.zbozi.cz/ns/offer/1.0">')
    expect(xml).toContain('<ITEMGROUP_ID>406</ITEMGROUP_ID>')
    expect(xml).toContain(
      '<PARAM><PARAM_NAME>Hmotnost</PARAM_NAME><VAL>250</VAL><UNIT>g</UNIT></PARAM>',
    )
    expect(xml).toContain(
      '<DELIVERY><DELIVERY_ID>VLASTNI_VYDEJNI_MISTA</DELIVERY_ID><DELIVERY_PRICE>0</DELIVERY_PRICE>',
    )
    expect(xml).toContain('<MANUFACTURER>Stubb’s</MANUFACTURER>')
    expect(renderZboziFeed(items, { ...ctx, pickup: false })).not.toContain('VLASTNI_VYDEJNI_MISTA')
  })
})

describe('xml and delivery helpers', () => {
  it('escapes and drops invalid characters', () => {
    expect(escapeXml('a<b>&"\'\u0001')).toBe('a&lt;b&gt;&amp;&quot;&apos;')
  })
  it('maps carriers and order methods to comparison-site ids', () => {
    expect(courierDeliveryId('ppl')).toBe('PPL')
    expect(courierDeliveryId(null)).toBe('PPL')
    expect(orderDeliveryId('pickup')).toBe('VLASTNI_VYDEJNI_MISTA')
    expect(orderDeliveryId('courier', 'dpd')).toBe('DPD')
    expect(orderDeliveryId(undefined)).toBeNull()
  })
  it('the checker rejects broken XML', () => {
    expect(() => assertWellFormedXml('<a><b></a>')).toThrow()
    expect(() => assertWellFormedXml('<a>x & y</a>')).toThrow()
  })
})
