import { describe, expect, it } from 'vitest'

import { whatsappUrl } from '../whatsapp'

import {
  currentConsent,
  hasMarketingConsent,
  parseConsent,
  readCookie,
  serializeConsent,
  toGoogleConsent,
} from './consent'
import {
  addShippingInfo,
  addToCart,
  beginCheckout,
  buildUserData,
  goodsNet,
  phoneE164,
  purchase,
  removeFromCart,
  selectItem,
  viewCart,
  viewItem,
  viewItemList,
} from './ecommerce'
import {
  gtmConfigFromEnv,
  gtmInlineScript,
  isHostAllowed,
  parseHostList,
  PRODUCTION_GTM_ID,
} from './gtm'
import { isValidItemId, itemGroupId, itemId } from './ids'
import { buildGa4Item, categoryIdChain, categoryPath, itemsValue, productBrand } from './items'
import {
  buildPurchaseEvent,
  capiBody,
  capiEndpoint,
  fbcFromAttribution,
  isTooOld,
  normalize,
  redactEvent,
  sha256,
} from './metaCapi'
import { sanitizePageLocation } from './pageView'
import { productItem } from './productItems'

const VARIANT = '6b03246590708426ec932438'

const CATEGORIES = [
  { id: 1, title: 'Steaky - řezy', parent: null },
  { id: 2, title: 'Vysoký roštěnec / Rib Eye', parent: 1 },
  { id: 3, title: 'Argentinské hovězí', parent: null },
]

const ribEye = (overrides: Partial<Parameters<typeof buildGa4Item>[0]> = {}) =>
  buildGa4Item({
    productId: 406,
    variantId: VARIANT,
    title: 'Argentinský rib eye',
    variantLabel: '500 g',
    categories: ['Steaky - řezy', 'Vysoký roštěnec / Rib Eye'],
    brand: null,
    price: 495,
    quantity: 1,
    weightGrams: 500,
    priceUnit: 'kg',
    unitPrice: 990,
    ...overrides,
  })

describe('item ids', () => {
  it('variant = product-variantRowId, product without variants = product id', () => {
    expect(itemId(406, VARIANT)).toBe(`406-${VARIANT}`)
    expect(itemId(512, null)).toBe('512')
    expect(itemGroupId(406)).toBe('406')
  })
  it('fits the strictest channel (Heureka: 36 chars, [A-Za-z0-9_-])', () => {
    expect(isValidItemId(itemId(9999999999, VARIANT))).toBe(true)
    expect(isValidItemId('a b')).toBe(false)
    expect(isValidItemId('x'.repeat(37))).toBe(false)
  })
})

describe('product facts', () => {
  it('category path follows the primary category and its parents', () => {
    expect(categoryPath([2, 3], CATEGORIES)).toEqual(['Steaky - řezy', 'Vysoký roštěnec / Rib Eye'])
    expect(categoryPath([{ id: 3 }], CATEGORIES)).toEqual(['Argentinské hovězí'])
    expect(categoryPath([], CATEGORIES)).toEqual([])
    expect(categoryIdChain([2, 3], CATEGORIES)).toEqual([2, 1, 3])
  })
  it('category path survives a cycle', () => {
    expect(
      categoryPath(
        [1],
        [
          { id: 1, title: 'A', parent: 2 },
          { id: 2, title: 'B', parent: 1 },
        ],
      ),
    ).toEqual(['B', 'A'])
  })
  it('brand falls back to Terrys (also for seed placeholders)', () => {
    expect(productBrand(null)).toBe('Terrys')
    expect(productBrand('DOPLNIT značku')).toBe('Terrys')
    expect(productBrand(' Kobe Farm ')).toBe('Kobe Farm')
  })
})

describe('GA4 items', () => {
  it('builds the standard and custom parameters, never coupon/discount', () => {
    const item = ribEye({ index: 3 })
    expect(item).toMatchObject({
      item_id: `406-${VARIANT}`,
      item_name: 'Argentinský rib eye',
      item_brand: 'Terrys',
      item_category: 'Steaky - řezy',
      item_category2: 'Vysoký roštěnec / Rib Eye',
      item_variant: '500 g',
      price: 495,
      quantity: 1,
      index: 3,
      item_group_id: '406',
      price_per_kg: 990,
      estimated_weight_grams: 500,
      price_is_estimate: true,
    })
    expect(item).not.toHaveProperty('coupon')
    expect(item).not.toHaveProperty('discount')
  })
  it('fixed-price goods: no weight, not an estimate, price per kg absent', () => {
    const item = buildGa4Item({
      productId: 512,
      variantId: null,
      title: 'Omáčka',
      price: 149,
      priceUnit: 'piece',
      unitPrice: 149,
      weightGrams: 300,
    })
    expect(item.item_id).toBe('512')
    expect(item.price_is_estimate).toBe(false)
    expect(item).not.toHaveProperty('price_per_kg')
    expect(item).not.toHaveProperty('estimated_weight_grams')
  })
  it('list items carry the list and only five category levels', () => {
    const item = ribEye({ categories: ['a', 'b', 'c', 'd', 'e', 'f'] })
    expect(item.item_category5).toBe('e')
    const listed = buildGa4Item(
      { productId: 1, variantId: null, title: 'x', price: 1, priceUnit: 'piece', unitPrice: 1 },
      { id: 'l', name: 'L' },
    )
    expect(listed).toMatchObject({ item_list_id: 'l', item_list_name: 'L' })
  })
  it('product item = the default (first purchasable) variant, same id as the feed', () => {
    const item = productItem(
      {
        id: 406,
        title: 'Rib eye',
        price: 990,
        priceUnit: 'kg',
        availability: 'in-stock',
        variants: [
          { id: 'aaa', label: '250 g', kind: 'weight', weightGrams: 250, availability: 'sold-out' },
          { id: 'bbb', label: '500 g', kind: 'weight', weightGrams: 500 },
        ],
      },
      ['Steaky'],
    )
    expect(item.item_id).toBe('406-bbb')
    expect(item.price).toBe(495)
  })
  it('weight-priced product without variants has no price', () => {
    const item = productItem(
      { id: 1, title: 'x', price: 990, priceUnit: 'kg', availability: 'in-stock', variants: [] },
      [],
    )
    expect(item).not.toHaveProperty('price')
    expect(item.item_id).toBe('1')
  })
})

describe('dataLayer messages', () => {
  const item = ribEye()
  const two = ribEye({ quantity: 2 })
  it.each([
    ['view_item', viewItem({ eventId: 'e', item })],
    ['add_to_cart', addToCart({ eventId: 'e', items: [two] })],
    ['remove_from_cart', removeFromCart({ eventId: 'e', items: [two] })],
    ['view_cart', viewCart({ eventId: 'e', items: [two] })],
    ['begin_checkout', beginCheckout({ eventId: 'e', items: [two] })],
  ])('%s has currency CZK and value = Σ price × quantity', (name, message) => {
    expect(message.event).toBe(name)
    expect(message.event_id).toBe('e')
    expect(message.value_is_estimate).toBe(true)
    expect(message.ecommerce.currency).toBe('CZK')
    expect(message.ecommerce.value).toBe(itemsValue(message.ecommerce.items))
    expect(JSON.stringify(message)).not.toMatch(/coupon|discount/)
  })
  it('view_item_list and select_item carry the list', () => {
    expect(
      viewItemList({ eventId: 'e', listId: 'c-12', listName: 'Wagyu', items: [item] }).ecommerce,
    ).toMatchObject({
      item_list_id: 'c-12',
      item_list_name: 'Wagyu',
      items: [item],
    })
    expect(
      selectItem({ eventId: 'e', listId: 'search', listName: 'Vyhledávání', item }).ecommerce.items,
    ).toHaveLength(1)
  })
  it('add_shipping_info: shipping tier in ecommerce, delivery date on top', () => {
    const message = addShippingInfo({
      eventId: 'e',
      items: [two],
      shippingTier: 'Rozvoz Terrys',
      deliveryDate: '2026-11-24',
    })
    expect(message.ecommerce.shipping_tier).toBe('Rozvoz Terrys')
    expect(message.delivery_date).toBe('2026-11-24')
    expect(message.ecommerce.value).toBe(990)
  })
  it('purchase: transaction id, event id, goods value, shipping, tax, net value', () => {
    const message = purchase({
      eventId: 'uuid-1',
      orderNumber: '100042',
      items: [
        two,
        buildGa4Item({
          productId: 512,
          variantId: null,
          title: 'Omáčka',
          price: 149,
          priceUnit: 'piece',
          unitPrice: 149,
        }),
      ],
      lines: [
        { estimatedPrice: 990, quantity: 2, vatRate: '12' },
        { estimatedPrice: 149, quantity: 1, vatRate: '21' },
      ],
      goodsEstimate: 1139,
      deliveryPrice: 229,
      totalEstimate: 1368,
      vat: [{ vat: 130.5 }, { vat: 29.83 }],
      shippingTier: 'Rozvoz Terrys',
      deliveryType: 'VLASTNI_PREPRAVA',
    })
    expect(message.event).toBe('purchase')
    expect(message.event_id).toBe('uuid-1')
    expect(message.ecommerce).toMatchObject({
      transaction_id: '100042',
      value: 1139,
      shipping: 229,
      tax: 160.33,
      currency: 'CZK',
    })
    expect(message.ecommerce.value).toBe(itemsValue(message.ecommerce.items))
    // 990/1.12 = 883.93, 149/1.21 = 123.14
    expect(message.value_net).toBe(1007.07)
    expect(message.value_tax_goods).toBe(131.93)
    expect(message.order_total).toBe(1368)
    expect(message.delivery_type).toBe('VLASTNI_PREPRAVA')
    expect(message).not.toHaveProperty('user_data')
  })
  it('goods net per VAT rate in haléře', () => {
    expect(goodsNet([{ estimatedPrice: 112, quantity: 1, vatRate: '12' }])).toBe(100)
    expect(goodsNet([{ estimatedPrice: 100, quantity: 1, vatRate: '0' }])).toBe(100)
  })
})

describe('enhanced conversions data', () => {
  it('normalises the phone to E.164', () => {
    expect(phoneE164('602 123 456')).toBe('+420602123456')
    expect(phoneE164('+420 602 123 456')).toBe('+420602123456')
    expect(phoneE164('00421 902 123 456')).toBe('+421902123456')
    expect(phoneE164('123')).toBeNull()
  })
  it('builds the GTM user-provided data object, leaving empty fields out', () => {
    expect(
      buildUserData({
        email: ' Jana@Example.test ',
        phone: '602123456',
        firstName: 'Jana',
        lastName: 'Nová',
        postcode: '120 00',
      }),
    ).toEqual({
      email: 'jana@example.test',
      phone_number: '+420602123456',
      address: { first_name: 'Jana', last_name: 'Nová', postal_code: '12000', country: 'CZ' },
    })
  })
})

describe('page location', () => {
  it('hides the thank-you token and personal query parameters', () => {
    expect(
      sanitizePageLocation('https://www.terrys.cz/objednavka/dekujeme/AbCdEfGhIjKlMnOpQrStUv'),
    ).toBe('https://www.terrys.cz/objednavka/dekujeme')
    expect(sanitizePageLocation('https://www.terrys.cz/kosik?email=a@b.cz&utm_source=x#top')).toBe(
      'https://www.terrys.cz/kosik?utm_source=x',
    )
    expect(sanitizePageLocation('nonsense')).toBe('')
  })
})

describe('consent', () => {
  const state = {
    analytics: true,
    marketing: false,
    version: '2026-11',
    timestamp: '2026-11-22T10:00:00.000Z',
  }
  it('round-trips the cookie value', () => {
    expect(parseConsent(serializeConsent(state))).toEqual(state)
    expect(parseConsent('garbage')).toBeNull()
    expect(parseConsent(encodeURIComponent('{"v":"1","a":2,"m":0,"t":"x"}'))).toBeNull()
  })
  it('an answer to an older text version counts as no answer', () => {
    expect(currentConsent(serializeConsent(state), '2026-11')).toEqual(state)
    expect(currentConsent(serializeConsent(state), '2027-01')).toBeNull()
  })
  it('maps categories to Consent Mode v2', () => {
    expect(toGoogleConsent(state)).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
    })
    expect(toGoogleConsent(null).analytics_storage).toBe('denied')
  })
  it('server reads marketing consent from the Cookie header', () => {
    const header = `_fbp=fb.1.1.2; terrys_consent=${serializeConsent({ ...state, marketing: true })}; x=y`
    expect(readCookie(header, '_fbp')).toBe('fb.1.1.2')
    expect(hasMarketingConsent(header)).toBe(true)
    expect(hasMarketingConsent(`terrys_consent=${serializeConsent(state)}`)).toBe(false)
    expect(hasMarketingConsent(null)).toBe(false)
  })
})

describe('GTM loading rules', () => {
  const env = {
    GTM_ENABLED: '1',
    GTM_ID: 'GTM-TEST123',
    GTM_ALLOWED_HOSTS: 'terrys.cz, www.terrys.cz',
    NODE_ENV: 'production',
  }
  it('needs the switch, a valid id and an allow-list', () => {
    expect(gtmConfigFromEnv(env, 'v1')).toMatchObject({
      id: 'GTM-TEST123',
      allowedHosts: ['terrys.cz', 'www.terrys.cz'],
    })
    expect(gtmConfigFromEnv({ ...env, GTM_ENABLED: '' }, 'v1')).toBeNull()
    expect(gtmConfigFromEnv({ ...env, GTM_ID: 'G-PXMZXR26RG' }, 'v1')).toBeNull()
    expect(gtmConfigFromEnv({ ...env, GTM_ALLOWED_HOSTS: '' }, 'v1')).toBeNull()
  })
  it('never the production container outside a production build', () => {
    expect(
      gtmConfigFromEnv({ ...env, GTM_ID: PRODUCTION_GTM_ID, NODE_ENV: 'development' }, 'v1'),
    ).toBeNull()
    expect(gtmConfigFromEnv({ ...env, GTM_ID: PRODUCTION_GTM_ID }, 'v1')?.id).toBe(
      PRODUCTION_GTM_ID,
    )
  })
  it('hostname allow-list (a clone domain is refused)', () => {
    const hosts = parseHostList('terrys.cz,www.terrys.cz,<bad>')
    expect(hosts).toEqual(['terrys.cz', 'www.terrys.cz'])
    expect(isHostAllowed('WWW.terrys.cz', hosts)).toBe(true)
    expect(isHostAllowed('terrys.live', hosts)).toBe(false)
    expect(isHostAllowed('localhost', hosts)).toBe(false)
  })
  it('inline script: host check, consent default before gtm.js, stored choice restored', () => {
    const script = gtmInlineScript({
      id: 'GTM-TEST123',
      allowedHosts: ['www.terrys.cz'],
      consentVersion: '2026-11',
    })
    const hostCheck = script.indexOf('hosts.indexOf')
    const defaults = script.indexOf("gtag('consent','default'")
    const update = script.indexOf("gtag('consent','update'")
    const load = script.indexOf('gtm.js?id=')
    expect(hostCheck).toBeGreaterThan(-1)
    expect(hostCheck).toBeLessThan(defaults)
    expect(defaults).toBeLessThan(update)
    expect(update).toBeLessThan(load)
    expect(script).toContain('"ad_user_data":"denied"')
    expect(script).toContain('"wait_for_update":500')
    expect(script).not.toContain('</script')
  })
})

describe('GTM inline script at runtime', () => {
  function run(hostname: string, cookie: string) {
    const inserted: { src?: string }[] = []
    const window = { location: { hostname }, dataLayer: undefined as unknown[] | undefined }
    const document = {
      cookie,
      createElement: () => ({}) as { src?: string; async?: boolean },
      getElementsByTagName: () => [
        { parentNode: { insertBefore: (s: { src?: string }) => inserted.push(s) } },
      ],
      head: { appendChild: (s: { src?: string }) => inserted.push(s) },
    }
    const script = gtmInlineScript({
      id: 'GTM-TEST123',
      allowedHosts: ['www.terrys.cz'],
      consentVersion: '2026-11',
    })
    new Function('window', 'document', script)(window, document)
    return {
      dataLayer: (window.dataLayer ?? []).map((entry) =>
        Array.from(entry as ArrayLike<unknown>).length
          ? Array.from(entry as ArrayLike<unknown>)
          : entry,
      ),
      inserted,
    }
  }
  it('does nothing on a foreign hostname', () => {
    const { dataLayer, inserted } = run('terrys.live', '')
    expect(dataLayer).toEqual([])
    expect(inserted).toEqual([])
  })
  it('sets the defaults, restores a stored choice and loads gtm.js', () => {
    const cookie = `x=1; terrys_consent=${serializeConsent({ analytics: true, marketing: false, version: '2026-11', timestamp: 't' })}`
    const { dataLayer, inserted } = run('www.terrys.cz', cookie)
    expect(dataLayer[0]).toEqual([
      'consent',
      'default',
      expect.objectContaining({ ad_storage: 'denied', wait_for_update: 500 }),
    ])
    expect(dataLayer).toContainEqual([
      'consent',
      'update',
      {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      },
    ])
    expect(dataLayer).toContainEqual(expect.objectContaining({ event: 'gtm.js' }))
    expect(inserted[0].src).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-TEST123')
  })
  it('a choice for an older text version is not restored', () => {
    const cookie = `terrys_consent=${serializeConsent({ analytics: true, marketing: true, version: 'old', timestamp: 't' })}`
    const { dataLayer } = run('www.terrys.cz', cookie)
    expect(dataLayer.some((entry) => Array.isArray(entry) && entry[1] === 'update')).toBe(false)
  })
})

describe('Meta Conversions API payload', () => {
  const order = {
    orderNumber: '100042',
    eventId: '0b8e7f2e-1111-4a5a-9c3b-123456789abc',
    createdAt: '2026-11-23T09:00:00.000Z',
    goodsEstimate: 1139,
    customer: {
      email: ' Jana@Example.test',
      phone: '602 123 456',
      firstName: 'Jana',
      lastName: 'Nová-Malá',
    },
    address: { city: 'Praha 2', postcode: '120 00' },
    lines: [
      { productId: 406, variantId: VARIANT, quantity: 2, estimatedPrice: 990 },
      { productId: 512, variantId: null, quantity: 1, estimatedPrice: 149 },
    ],
    attribution: { fbclid: 'IwAR123456789abc', firstSeenAt: '2026-11-20T08:00:00.000Z' },
  }
  it('normalises like Meta asks', () => {
    expect(normalize.email(' A@B.CZ ')).toBe('a@b.cz')
    expect(normalize.phone('602 123 456')).toBe('420602123456')
    expect(normalize.phone('+420 602 123 456')).toBe('420602123456')
    expect(normalize.name('Nová-Malá')).toBe('novámalá')
    expect(normalize.city('Praha 2')).toBe('praha2')
    expect(normalize.zip('120 00')).toBe('12000')
  })
  it('builds a deduplicable Purchase with hashed user data', () => {
    const event = buildPurchaseEvent(
      order,
      { ip: '1.2.3.4', userAgent: 'UA', fbp: 'fb.1.1.1' },
      'https://www.terrys.cz/',
    )
    expect(event).toMatchObject({
      event_name: 'Purchase',
      event_id: order.eventId,
      event_time: Date.parse(order.createdAt) / 1000,
      action_source: 'website',
      event_source_url: 'https://www.terrys.cz/objednavka',
    })
    expect(event.user_data.em).toEqual([sha256('jana@example.test')])
    expect(event.user_data.ph).toEqual([sha256('420602123456')])
    expect(event.user_data.ct).toEqual([sha256('praha2')])
    expect(event.user_data.country).toEqual([sha256('cz')])
    expect(event.user_data.client_ip_address).toBe('1.2.3.4')
    expect(event.user_data.fbp).toBe('fb.1.1.1')
    expect(event.user_data.fbc).toBe(
      `fb.1.${Date.parse('2026-11-20T08:00:00.000Z')}.IwAR123456789abc`,
    )
    expect(event.custom_data).toEqual({
      currency: 'CZK',
      value: 1139,
      content_type: 'product',
      content_ids: [`406-${VARIANT}`, '512'],
      contents: [
        { id: `406-${VARIANT}`, quantity: 2, item_price: 495 },
        { id: '512', quantity: 1, item_price: 149 },
      ],
      num_items: 3,
      order_id: '100042',
    })
  })
  it('fbc from the browser cookie wins; invalid fbclid is ignored', () => {
    expect(buildPurchaseEvent(order, { fbc: 'fb.1.9.x' }, 'https://x').user_data.fbc).toBe(
      'fb.1.9.x',
    )
    expect(fbcFromAttribution({ fbclid: 'bad id!' })).toBeNull()
  })
  it('endpoint, body, age limit and redaction', () => {
    expect(capiEndpoint('123', 'v27.0')).toBe('https://graph.facebook.com/v27.0/123/events')
    const event = buildPurchaseEvent(order, { ip: '1.2.3.4', userAgent: 'UA' }, 'https://x')
    expect(capiBody([event], 'token', 'TEST1')).toMatchObject({
      access_token: 'token',
      test_event_code: 'TEST1',
    })
    expect(capiBody([event], 'token')).not.toHaveProperty('test_event_code')
    expect(isTooOld(event, new Date('2026-11-29T09:00:00Z'))).toBe(false)
    expect(isTooOld(event, new Date('2026-12-01T09:00:00Z'))).toBe(true)
    const redacted = redactEvent(event)
    expect(redacted.user_data).not.toHaveProperty('client_ip_address')
    expect(redacted.user_data).not.toHaveProperty('client_user_agent')
    expect(redacted.user_data.em).toEqual(event.user_data.em)
  })
})

describe('WhatsApp link', () => {
  it('builds wa.me links and hides empty numbers', () => {
    expect(whatsappUrl('+420 602 123 456')).toBe('https://wa.me/420602123456')
    expect(whatsappUrl('602 123 456', 'Dotaz')).toBe('https://wa.me/420602123456?text=Dotaz')
    expect(whatsappUrl('')).toBeNull()
    expect(whatsappUrl('DOPLNIT')).toBeNull()
    expect(whatsappUrl('12')).toBeNull()
  })
})
