import { describe, expect, it } from 'vitest'

import { esc } from './layout'
import { type OrderEmailData, orderConfirmationEmail, orderInternalEmail } from './order'
import { withdrawalConfirmationEmail } from './withdrawal'

const base: OrderEmailData = {
  orderNumber: '100042',
  createdAt: '2026-11-23T09:00:00.000Z',
  customer: {
    firstName: 'Jana',
    lastName: 'Nováková',
    email: 'jana@example.test',
    phone: '+420 602 123 456',
    companyName: 'Firma <s.r.o.>',
    ico: '45274649',
  },
  lines: [
    {
      title: 'Rib Eye',
      variantLabel: '250 g',
      quantity: 2,
      unitPrice: 990,
      priceUnit: 'kg',
      vatRate: '12',
      estimatedWeightGrams: 250,
      estimatedPrice: 495,
    },
    {
      title: 'Omáčka',
      quantity: 1,
      unitPrice: 149,
      priceUnit: 'piece',
      vatRate: '21',
      estimatedPrice: 149,
    },
  ],
  totals: {
    goodsEstimate: 644,
    deliveryPrice: 229,
    totalEstimate: 873,
    vat: [{ rate: 12, base: 600, vat: 72, gross: 672 }],
  },
  delivery: {
    methodName: 'Rozvoz Terrys',
    methodType: 'own-delivery',
    date: '2026-11-24',
    postcode: '12000',
  },
  address: { street: 'Italská 17', city: 'Praha 2', postcode: '12000' },
  note: 'Prosím <b>tenké</b> plátky',
  voucherCode: 'DP-123',
  shop: {
    siteUrl: 'https://www.terrys.cz',
    contactEmail: 'info@example.test',
    priceNotice: 'Cena je orientační.',
  },
  withdrawalUrl: 'https://www.terrys.cz/odstoupeni-od-smlouvy',
}

describe('order e-mails', () => {
  it('customer confirmation: items, estimate notice, delivery, signature, escaped input', () => {
    const email = orderConfirmationEmail({
      ...base,
      orderUrl: 'https://www.terrys.cz/objednavka/dekujeme/x',
    })
    expect(email.subject).toContain('100042')
    for (const part of [email.html, email.text]) {
      expect(part).toContain('Rib Eye')
      expect(part).toContain('±15 %')
      expect(part).toContain('úterý 24. 11. 2026')
      expect(part).toContain('Těší se na vás řezníci z Terrysu')
      expect(part).toContain('DP-123')
    }
    expect(email.text).toMatch(/PLATÍTE AŽ PŘI PŘEVZETÍ/)
    expect(email.html).not.toContain('<b>tenké</b>')
    expect(email.html).toContain('&lt;b&gt;tenké&lt;/b&gt;')
    expect(email.html).toContain('Italská 17')
  })

  it('pickup confirmation shows the pickup place, no delivery address', () => {
    const email = orderConfirmationEmail({
      ...base,
      delivery: {
        methodName: 'Osobní odběr',
        methodType: 'pickup',
        date: '2026-11-25',
        postcode: '12000',
        pickupLocation: { name: 'Prodejna', street: 'Italská 17', city: 'Praha 2', zip: '12000' },
      },
      address: null,
      totals: { ...base.totals, deliveryPrice: 0, totalEstimate: 644 },
    })
    expect(email.text).toContain('VYZVEDNUTÍ')
    expect(email.text).toContain('Prodejna, Italská 17, 120 00 Praha 2')
    expect(email.text).toContain('Osobní odběr: zdarma')
  })

  it('internal copy contains everything needed to fulfil the order', () => {
    const email = orderInternalEmail({ ...base, attribution: { utmSource: 'google' } })
    expect(email.subject).toContain('100042')
    for (const needle of [
      '+420 602 123 456',
      'jana@example.test',
      'IČO',
      'DPH 12 %',
      'NEOVĚŘENO',
      'utmSource',
      'Italská 17',
    ]) {
      expect(email.text).toContain(needle)
    }
  })

  it('withdrawal confirmation repeats the content with date and time', () => {
    const email = withdrawalConfirmationEmail({
      name: 'Jana',
      email: 'jana@example.test',
      orderNumber: '100042',
      submittedAt: '2026-11-25T10:15:30.000Z',
      matchedOrder: true,
      shop: { siteUrl: 'https://www.terrys.cz' },
    })
    expect(email.text).toContain('25. listopadu 2026')
    expect(email.text).toContain('11:15:30')
    expect(email.text).toContain('celé objednávky')
  })

  it('escapes HTML', () => {
    expect(esc('<a href="x">')).toBe('&lt;a href=&quot;x&quot;&gt;')
  })
})
