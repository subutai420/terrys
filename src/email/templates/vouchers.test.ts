import { describe, expect, it, vi } from 'vitest'

import { sendViaResendWithAttachments } from '@/email/adapter'
import { checkCartLines } from '@/lib/orders/cartCheck'
import { buildFeedItems, type FeedProductInput } from '@/lib/feeds/items'
import { purchase } from '@/lib/measurement/ecommerce'

import {
  QR_CID,
  type VoucherEmailData,
  voucherIssuedEmail,
  voucherPaidEmail,
  voucherReminderEmail,
} from './vouchers'

const data: VoucherEmailData = {
  orderNumber: '100123',
  firstName: 'Petra <script>',
  vouchers: [
    { code: 'K7MQ-3XPA-9TC-R4W', value: 1000, expiresOn: '2027-12-31' },
    { code: 'ABCD-EFGH-JKC-MNP', value: 1000, expiresOn: '2027-12-31' },
  ],
  recipientName: 'Jan Novák',
  payment: {
    amount: 2000,
    accountDisplay: '123/0600',
    iban: 'CZ9106000000000000000123',
    variableSymbol: '100123',
    message: 'Darkovy poukaz Terrys 100123',
    dueAt: '2026-11-25T21:00:00.000Z',
    hasQr: true,
  },
  orderUrl: 'https://www.terrys.cz/objednavka/dekujeme/abc',
  pdfUrl: 'https://www.terrys.cz/api/gift-vouchers/pdf/abc',
  shop: { siteUrl: 'https://www.terrys.cz', contactEmail: 'info@terrys.cz', contactPhone: null },
}

describe('voucher e-mails', () => {
  it('issued: QR as cid image + payment details as text, honest validity wording, escaped', () => {
    const email = voucherIssuedEmail(data)
    expect(email.subject).toContain('100123')
    expect(email.html).toContain(`cid:${QR_CID}`)
    expect(email.html).not.toContain('data:image')
    expect(email.html).toContain('Petra &lt;script&gt;')
    for (const text of [email.html, email.text]) {
      expect(text).toContain('123/0600')
      expect(text).toContain('100123')
      expect(text).toContain('K7MQ-3XPA-9TC-R4W')
      expect(text).toContain('31. 12. 2027')
    }
    expect(email.text).toMatch(/ZAČNOU PLATIT, JAKMILE NÁM DORAZÍ PLATBA/)
    expect(email.text).toMatch(/25\. 11\. 2026 22:00/) // due date in Prague time (UTC+1)
    // Never a discount / free shipping vocabulary.
    expect(email.html).not.toMatch(/sleva|zdarma/i)
  })

  it('paid and reminder e-mails', () => {
    expect(voucherPaidEmail(data).subject).toContain('Platba přijata')
    const reminder = voucherReminderEmail(data)
    expect(reminder.subject).toContain('Připomínka platby')
    expect(reminder.text).toContain('Variabilní symbol: 100123')
    expect(
      voucherIssuedEmail({ ...data, payment: { ...data.payment, hasQr: false } }).html,
    ).not.toContain('cid:')
  })
})

describe('Resend with attachments', () => {
  it('sends Base64 content and the content id of inline images', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 }))
    await sendViaResendWithAttachments(
      'test-key',
      {
        to: 'a@example.test',
        subject: 'S',
        html: '<img src="cid:qr">',
        attachments: [
          { filename: 'qr.png', content: Buffer.from('png'), contentType: 'image/png', cid: 'qr' },
          { filename: 'p.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' },
        ],
      },
      fetchMock as unknown as typeof fetch,
    )
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.attachments[0]).toEqual({
      filename: 'qr.png',
      content: Buffer.from('png').toString('base64'),
      content_type: 'image/png',
      content_id: 'qr',
    })
    expect(body.attachments[1].content_id).toBeUndefined()
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })
})

describe('voucher lines in the cart check', () => {
  const product = {
    id: 5,
    title: 'Dárkový poukaz 1 000 Kč',
    price: 1000,
    priceUnit: 'piece' as const,
    vatRate: '0',
    availability: 'in-stock' as const,
    sku: null,
    url: '/p',
    imageUrl: null,
    voucher: { value: 1000, formats: ['electronic' as const] },
    variants: [],
  }
  it('accepts an offered format with a fixed price, refuses others', () => {
    const ok = checkCartLines(
      [{ productId: 5, variantId: 'electronic', quantity: 3 }],
      new Map([[5, product]]),
    )
    expect(ok.lines[0]).toMatchObject({
      lineEstimate: 3000,
      variantLabel: 'Elektronický (PDF e-mailem)',
      weightGrams: null,
    })
    const bad = checkCartLines(
      [{ productId: 5, variantId: 'printed', quantity: 1 }],
      new Map([[5, product]]),
    )
    expect(bad.lines).toHaveLength(0)
    expect(bad.problems[0].code).toBe('variant-gone')
  })
})

describe('measurement and feeds', () => {
  it('a voucher-only purchase has shipping 0 and no shipping tier / coupon', () => {
    const message = purchase({
      eventId: 'e',
      orderNumber: '1',
      items: [],
      lines: [{ estimatedPrice: 1000, quantity: 1, vatRate: '0' }],
      goodsEstimate: 1000,
      deliveryPrice: 0,
      totalEstimate: 1000,
      vat: [],
      shippingTier: '',
      deliveryType: null,
    }) as unknown as { ecommerce: Record<string, unknown>; delivery_type?: string }
    expect(message.ecommerce.shipping).toBe(0)
    expect('shipping_tier' in message.ecommerce).toBe(false)
    expect('coupon' in message.ecommerce).toBe(false)
    expect(message.delivery_type).toBeUndefined()
  })

  it('vouchers are excluded from feeds by default, only the printed one when included', () => {
    const base: FeedProductInput = {
      id: 9,
      title: 'Dárkový poukaz 2 000 Kč',
      price: 2000,
      priceUnit: 'piece',
      availability: 'in-stock',
      description: 'Poukaz',
      images: ['/img.jpg'],
      categoryPath: ['Dárkové poukazy'],
      categories: { google: '53', heureka: null, zbozi: null },
      excluded: false,
      categoryExcluded: false,
      voucher: { included: false, formats: ['electronic', 'printed'] },
    }
    const off = buildFeedItems([base], 'https://www.terrys.cz')
    expect(off.items).toHaveLength(0)
    expect(off.excluded[0].reason).toMatch(/poukaz/)
    const on = buildFeedItems(
      [{ ...base, voucher: { included: true, formats: ['electronic', 'printed'] } }],
      'https://www.terrys.cz',
    )
    expect(on.items).toHaveLength(1)
    expect(on.items[0]).toMatchObject({
      id: '9-printed',
      price: 2000,
      categories: { google: '53' },
    })
    expect(on.items[0].link).toContain('varianta=printed')
  })
})
