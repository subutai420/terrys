import type { FulfilmentEmailData } from '@/email/templates/fulfilment'
import {
  cancelledEmail,
  finalPriceEmail,
  readyForPickupEmail,
  shippedEmail,
} from '@/email/templates/fulfilment'
import type { RenderedEmail } from '@/email/templates/order'
import {
  type OrderEmailData,
  orderConfirmationEmail,
  orderInternalEmail,
} from '@/email/templates/order'
import {
  type VoucherEmailData,
  voucherIssuedEmail,
  voucherPaidEmail,
  voucherReminderEmail,
} from '@/email/templates/vouchers'
import {
  type WithdrawalEmailData,
  withdrawalConfirmationEmail,
  withdrawalInternalEmail,
} from '@/email/templates/withdrawal'

/**
 * Stage 9: one SAMPLE of every e-mail the shop sends, with clearly fake data ("UKÁZKA",
 * example.test addresses, the QR Platba spec's example account). Used by
 * `pnpm ops:test-emails` (src/ops/testEmails.ts) to check rendering and deliverability
 * (Gmail / Outlook / Apple Mail, spam folder, SPF/DKIM/DMARC "pass") before the launch.
 */

type Shop = {
  siteUrl: string
  contactEmail?: string | null
  contactPhone?: string | null
  companyLine?: string | null
}

export const SAMPLE_PREFIX = '[TEST] '

const orderData = (shop: Shop, withdrawalUrl: string): OrderEmailData => ({
  orderNumber: '999001',
  createdAt: new Date().toISOString(),
  customer: {
    firstName: 'Ukázka',
    lastName: 'Testovací',
    email: 'zakaznik@example.test',
    phone: '+420 600 000 000',
  },
  lines: [
    {
      title: 'Hovězí Rib Eye (UKÁZKA)',
      variantLabel: 'cca 300 g',
      variantId: 'sample',
      quantity: 2,
      unitPrice: 990,
      priceUnit: 'kg',
      vatRate: '12',
      estimatedWeightGrams: 300,
      estimatedPrice: 594,
    },
  ],
  totals: {
    goodsEstimate: 594,
    deliveryPrice: 229,
    totalEstimate: 823,
    vat: [{ rate: 12, base: 734.82, vat: 88.18, gross: 823 }],
  },
  delivery: {
    methodName: 'Rozvoz Terrys',
    methodType: 'own-delivery',
    date: new Date().toISOString().slice(0, 10),
    postcode: '12000',
  },
  address: { street: 'Testovací 1', city: 'Praha 2', postcode: '12000' },
  note: 'Ukázková poznámka.',
  shop: { ...shop, priceNotice: 'Cena je odhad podle průměrné hmotnosti kusu.' },
  orderUrl: `${shop.siteUrl}/`,
  withdrawalUrl,
})

const fulfilmentData = (shop: Shop): FulfilmentEmailData => ({
  orderNumber: '999001',
  firstName: 'Ukázka',
  lines: [
    {
      title: 'Hovězí Rib Eye (UKÁZKA)',
      variantLabel: 'cca 300 g',
      quantity: 2,
      unitPrice: 990,
      priceUnit: 'kg',
      actualWeightGrams: 640,
      finalPrice: 634,
      resolution: 'weighed',
    },
  ],
  goodsFinal: 634,
  deliveryPrice: 229,
  totalFinal: 863,
  vouchers: [],
  amountDue: 863,
  delivery: {
    methodName: 'Kurýr PPL',
    methodType: 'courier',
    date: new Date().toISOString().slice(0, 10),
  },
  address: 'Testovací 1, 120 00 Praha 2',
  pickup: {
    name: 'Prodejna Italská (UKÁZKA)',
    address: 'Italská 17, Praha 2',
    openingHours: ['Po–Pá 9–18'],
  },
  tracking: { number: 'SIM0000000000', url: null },
  cancellationReason: 'Ukázkový důvod zrušení.',
  shop,
})

const voucherData = (shop: Shop): VoucherEmailData => ({
  orderNumber: '999002',
  firstName: 'Ukázka',
  vouchers: [
    { code: 'TEST-TEST-TET-EST', value: 1000, expiresOn: `${new Date().getFullYear() + 1}-12-31` },
  ],
  recipientName: 'Obdarovaný (UKÁZKA)',
  payment: {
    amount: 1000,
    accountDisplay: '123/0600 (UKÁZKOVÝ ÚČET – NEPLATIT)',
    iban: 'CZ9106000000000000000123',
    variableSymbol: '999002',
    message: 'Darkovy poukaz Terrys 999002',
    dueAt: new Date(Date.now() + 72 * 3600_000).toISOString(),
    // The test script attaches the QR image (src/ops/testEmails.ts).
    hasQr: true,
  },
  orderUrl: `${shop.siteUrl}/`,
  pdfUrl: null,
  shop,
})

const withdrawalData = (shop: Shop): WithdrawalEmailData => ({
  name: 'Ukázka Testovací',
  email: 'zakaznik@example.test',
  orderNumber: '999001',
  items: 'Vše (UKÁZKA)',
  submittedAt: new Date().toISOString(),
  matchedOrder: true,
  shop,
})

/** Every e-mail kind the shop sends, rendered with sample data. */
export function sampleEmails(
  shop: Shop,
  withdrawalUrl: string,
): { kind: string; email: RenderedEmail }[] {
  const order = orderData(shop, withdrawalUrl)
  const fulfilment = fulfilmentData(shop)
  const voucher = voucherData(shop)
  const withdrawal = withdrawalData(shop)
  const list: { kind: string; email: RenderedEmail }[] = [
    { kind: 'order-confirmation', email: orderConfirmationEmail(order) },
    { kind: 'order-internal', email: orderInternalEmail(order) },
    { kind: 'final-price', email: finalPriceEmail(fulfilment) },
    { kind: 'shipped-courier', email: shippedEmail(fulfilment) },
    {
      kind: 'shipped-own-van',
      email: shippedEmail({
        ...fulfilment,
        delivery: {
          ...fulfilment.delivery!,
          methodName: 'Rozvoz Terrys',
          methodType: 'own-delivery',
        },
        tracking: null,
      }),
    },
    {
      kind: 'ready-for-pickup',
      email: readyForPickupEmail({
        ...fulfilment,
        delivery: { ...fulfilment.delivery!, methodName: 'Osobní odběr', methodType: 'pickup' },
      }),
    },
    { kind: 'cancelled', email: cancelledEmail(fulfilment) },
    { kind: 'voucher-issued', email: voucherIssuedEmail(voucher) },
    { kind: 'voucher-paid', email: voucherPaidEmail(voucher) },
    { kind: 'voucher-reminder', email: voucherReminderEmail(voucher) },
    { kind: 'withdrawal-confirmation', email: withdrawalConfirmationEmail(withdrawal) },
    { kind: 'withdrawal-internal', email: withdrawalInternalEmail(withdrawal) },
  ]
  return list.map(({ kind, email }) => ({
    kind,
    email: { ...email, subject: `${SAMPLE_PREFIX}${email.subject}` },
  }))
}
