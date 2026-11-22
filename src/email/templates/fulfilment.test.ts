import { describe, expect, it } from 'vitest'

import {
  cancelledEmail,
  type FulfilmentEmailData,
  finalPriceEmail,
  readyForPickupEmail,
  shippedEmail,
} from './fulfilment'

const data: FulfilmentEmailData = {
  orderNumber: '100042',
  firstName: 'Jana',
  lines: [
    {
      title: 'Rib Eye',
      variantLabel: '250 g',
      quantity: 2,
      unitPrice: 990,
      priceUnit: 'kg',
      actualWeightGrams: 523,
      finalPrice: 518,
      resolution: 'weighed',
    },
    {
      title: 'Omáčka <BBQ>',
      quantity: 1,
      unitPrice: 149,
      priceUnit: 'piece',
      finalPrice: 149,
      resolution: 'piece',
    },
    {
      title: 'Picanha',
      quantity: 1,
      unitPrice: 690,
      priceUnit: 'kg',
      finalPrice: 0,
      resolution: 'unavailable',
      weighNote: 'došla',
    },
  ],
  goodsFinal: 667,
  deliveryPrice: 229,
  totalFinal: 896,
  vouchers: [{ code: 'DARKY-500', amount: 500 }],
  amountDue: 396,
  delivery: { methodName: 'Kurýr PPL', methodType: 'courier', date: '2026-11-25' },
  address: 'Masarykova 12, 602 00 Brno',
  tracking: {
    number: '58800700001',
    url: 'https://www.ppl.cz/vyhledat-zasilku?shipmentId=58800700001',
  },
  shop: {
    siteUrl: 'https://www.terrys.cz',
    contactEmail: 'info@example.test',
    contactPhone: '+420 777 000 000',
  },
}

describe('stage 5 customer e-mails', () => {
  it('final price: lines with actual weights, voucher as payment, amount to pay, escaped', () => {
    const email = finalPriceEmail(data)
    expect(email.subject).toMatch(
      /^Objednávka č\. 100042 je zvážená – k zaplacení 396\sKč \| Terrys Steak$/,
    )
    expect(email.html).toContain('zváženo 523 g')
    expect(email.html).toContain('Uhrazeno dárkovým poukazem DARKY-500')
    expect(email.html).toContain('Omáčka &lt;BBQ&gt;')
    expect(email.html).toContain('není k dispozici')
    expect(email.html).not.toMatch(/sleva|discount/i)
    expect(email.text).toMatch(/ZBÝVÁ ZAPLATIT: 396\sKč/)
    expect(email.text).toContain('kurýrovi při převzetí zásilky (dobírka)')
    expect(email.text).toContain('ve středu 25. 11. 2026')
  })

  it('fully paid by voucher → nothing to pay', () => {
    const email = finalPriceEmail({ ...data, amountDue: 0, vouchers: [{ code: 'X', amount: 896 }] })
    expect(email.text).toContain('Nic neplatíte')
  })

  it('shipped by courier: tracking link; own van: driver on the way on the date', () => {
    const courier = shippedEmail(data)
    expect(courier.html).toContain('https://www.ppl.cz/vyhledat-zasilku?shipmentId=58800700001')
    expect(courier.text).toContain('Číslo zásilky: 58800700001')
    const van = shippedEmail({
      ...data,
      delivery: { ...data.delivery!, methodType: 'own-delivery', methodName: 'Rozvoz' },
      tracking: null,
    })
    expect(van.subject).toContain('náš řidič k vám vyráží ve středu 25. 11. 2026')
    expect(van.text).toContain('našemu řidiči při převzetí')
    expect(van.html).not.toContain('Sledovat zásilku')
  })

  it('ready for pickup: place, opening hours when filled, amount', () => {
    const email = readyForPickupEmail({
      ...data,
      delivery: { methodName: 'Odběr Italská', methodType: 'pickup', date: '2026-11-25' },
      pickup: {
        name: 'Prodejna Italská 17',
        address: 'Italská 17, 120 00 Praha 2',
        openingHours: ['Pondělí: 9–18'],
      },
    })
    expect(email.text).toContain('Prodejna Italská 17, Italská 17, 120 00 Praha 2')
    expect(email.text).toContain('Pondělí: 9–18')
    expect(email.text).toContain('při vyzvednutí')
    const noHours = readyForPickupEmail({
      ...data,
      delivery: { methodName: 'X', methodType: 'pickup', date: '2026-11-25' },
      pickup: { name: 'Sklad', address: 'Slivínko', openingHours: [] },
    })
    expect(noHours.text).not.toContain('Otevírací doba')
  })

  it('cancellation with the reason', () => {
    const email = cancelledEmail({ ...data, cancellationReason: 'Zboží <došlo>' })
    expect(email.subject).toBe('Objednávka č. 100042 je zrušená | Terrys Steak')
    expect(email.html).toContain('Zboží &lt;došlo&gt;')
    expect(email.text).toContain('Důvod: Zboží <došlo>')
  })
})
