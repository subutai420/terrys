import { formatCzk } from '@/lib/format'
import { formatIsoDay } from '@/lib/vouchers/balance'

import {
  BRAND,
  button,
  emailLayout,
  esc,
  heading,
  keyValueTable,
  notice,
  paragraph,
} from './layout'
import type { RenderedEmail } from './order'

/**
 * Stage 7 – gift voucher e-mails (plain template functions like the other e-mails):
 *  - `voucherIssuedEmail`: right after an ELECTRONIC voucher order – the vouchers (PDF attached),
 *    payment details as text AND as a QR code (inline image referenced by `cid:`, because many
 *    e-mail clients – Gmail, Outlook – block `data:` images), due date, honest wording that the
 *    voucher becomes valid once the payment arrives.
 *  - `voucherPaidEmail`: short confirmation after staff marked the payment.
 *  - `voucherReminderEmail`: one reminder when the payment is overdue (setting).
 */

export const QR_CID = 'qr-platba@terrys'

export type VoucherEmailShop = {
  siteUrl: string
  contactEmail?: string | null
  contactPhone?: string | null
  companyLine?: string | null
}

export type VoucherEmailPayment = {
  amount: number
  /** Czech account "123456789/0800" or formatted IBAN. */
  accountDisplay: string
  iban: string
  variableSymbol: string
  message: string
  /** ISO instant. */
  dueAt: string
  /** True when a QR PNG is attached with `QR_CID`. */
  hasQr: boolean
}

export type VoucherEmailData = {
  orderNumber: string
  firstName: string
  vouchers: { code: string; value: number; expiresOn: string }[]
  recipientName?: string | null
  payment: VoucherEmailPayment
  orderUrl: string | null
  pdfUrl: string | null
  shop: VoucherEmailShop
}

const czk = (n: number) => formatCzk(n)

export function formatDueAt(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function footer(shop: VoucherEmailShop): string {
  const contacts = [
    shop.contactPhone ? `tel. ${esc(shop.contactPhone)}` : null,
    shop.contactEmail
      ? `<a href="mailto:${esc(shop.contactEmail)}" style="color:#ffffff;">${esc(shop.contactEmail)}</a>`
      : null,
  ].filter(Boolean)
  return [
    contacts.length ? `Dotazy: ${contacts.join(' · ')}<br>` : '',
    shop.companyLine ? `${esc(shop.companyLine)}<br>` : '',
    `<a href="${esc(shop.siteUrl)}" style="color:#ffffff;">${esc(shop.siteUrl.replace(/^https?:\/\//, ''))}</a>`,
  ].join('')
}

function vouchersTable(data: VoucherEmailData): string {
  const cell = `padding:10px 6px;border-bottom:1px solid ${BRAND.line};font-size:14px;`
  const rows = data.vouchers
    .map(
      (v) =>
        `<tr><td style="${cell}font-family:'Courier New',monospace;font-size:16px;font-weight:bold;letter-spacing:1px;color:${BRAND.ink};">${esc(v.code)}</td><td style="${cell}text-align:right;white-space:nowrap;"><strong>${esc(czk(v.value))}</strong></td><td style="${cell}text-align:right;white-space:nowrap;color:${BRAND.muted};">do ${esc(formatIsoDay(v.expiresOn))}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><th align="left" style="padding:6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;border-bottom:2px solid ${BRAND.brown};">Kód poukazu</th><th align="right" style="padding:6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;border-bottom:2px solid ${BRAND.brown};">Hodnota</th><th align="right" style="padding:6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;border-bottom:2px solid ${BRAND.brown};">Platnost</th></tr>
${rows}
</table>`
}

function paymentRows(p: VoucherEmailPayment): [string, string][] {
  return [
    ['Částka', `<strong style="font-size:17px;color:${BRAND.red};">${esc(czk(p.amount))}</strong>`],
    ['Číslo účtu', `<strong>${esc(p.accountDisplay)}</strong>`],
    ['IBAN', esc(p.iban.replace(/(.{4})/g, '$1 ').trim())],
    ['Variabilní symbol', `<strong>${esc(p.variableSymbol)}</strong>`],
    ['Zpráva pro příjemce', esc(p.message)],
    ['Zaplaťte do', `<strong>${esc(formatDueAt(p.dueAt))}</strong>`],
  ]
}

function paymentBox(p: VoucherEmailPayment): string {
  const qr = p.hasQr
    ? `<td width="196" style="padding:0 16px 0 0;vertical-align:top;"><img src="cid:${QR_CID}" width="180" height="180" alt="QR kód pro platbu" style="display:block;width:180px;height:180px;border:0;"><div style="font-size:12px;color:${BRAND.muted};padding-top:4px;text-align:center;">QR Platba – naskenujte v&nbsp;bankovní aplikaci</div></td>`
    : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;border-collapse:collapse;border:2px solid ${BRAND.gold};border-radius:6px;"><tr><td style="padding:16px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${qr}<td style="vertical-align:top;">${keyValueTable(paymentRows(p))}</td></tr></table>
</td></tr></table>`
}

function paymentText(p: VoucherEmailPayment): string {
  return [
    `Částka: ${czk(p.amount)}`,
    `Číslo účtu: ${p.accountDisplay}`,
    `IBAN: ${p.iban}`,
    `Variabilní symbol: ${p.variableSymbol}`,
    `Zpráva pro příjemce: ${p.message}`,
    `Zaplaťte do: ${formatDueAt(p.dueAt)}`,
  ].join('\n')
}

const SIGN = 'Řezníci z Terrysu'

/** Right after an electronic voucher order. */
export function voucherIssuedEmail(data: VoucherEmailData): RenderedEmail {
  const many = data.vouchers.length > 1
  const subject = `${many ? 'Vaše dárkové poukazy' : 'Váš dárkový poukaz'} Terrys – objednávka č. ${data.orderNumber}`
  const due = formatDueAt(data.payment.dueAt)
  const body = [
    `<h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${BRAND.brown};">Děkujeme, ${many ? 'poukazy posíláme' : 'poukaz posíláme'} v&nbsp;příloze</h1>`,
    paragraph(`Dobrý den, ${esc(data.firstName)},`),
    paragraph(
      `děkujeme za objednávku č.&nbsp;${esc(data.orderNumber)}. ${many ? 'Dárkové poukazy jsou' : 'Dárkový poukaz je'} v&nbsp;příloze jako PDF – můžete ${many ? 'je' : 'ho'} vytisknout nebo rovnou přeposlat obdarovanému.`,
    ),
    notice(
      `<strong>${many ? 'Poukazy začnou' : 'Poukaz začne'} platit, jakmile nám dorazí platba.</strong> Prosíme o&nbsp;úhradu převodem do <strong>${esc(due)}</strong>. Nejrychleji zaplatíte naskenováním QR kódu v&nbsp;mobilní aplikaci banky. Potvrzení o&nbsp;přijetí platby vám pošleme e-mailem.`,
    ),
    heading('Platební údaje'),
    paymentBox(data.payment),
    heading(many ? 'Vaše poukazy' : 'Váš poukaz'),
    vouchersTable(data),
    data.recipientName
      ? paragraph(
          `Na poukazu je věnování pro: <strong>${esc(data.recipientName)}</strong>.`,
          'margin-top:12px;',
        )
      : '',
    data.pdfUrl
      ? button(data.pdfUrl, many ? 'Stáhnout poukazy (PDF)' : 'Stáhnout poukaz (PDF)')
      : '',
    heading('Jak poukaz uplatnit'),
    paragraph(
      'Při objednávce na terrys.cz zaškrtněte „Zaplatím částečně dárkovým poukazem Terrys“ a zadejte kód (v prodejně ho stačí ukázat). Hodnotu odečteme při vyúčtování objednávky – poukaz je platidlo, cena masa se nemění. Poukaz lze čerpat i postupně ve více nákupech až do data platnosti.',
    ),
    paragraph(
      'Kód chraňte jako hotovost: kdo ho zná, může ho uplatnit.',
      `font-size:13px;color:${BRAND.muted};`,
    ),
    data.orderUrl
      ? paragraph(
          `Shrnutí objednávky: <a href="${esc(data.orderUrl)}" style="color:${BRAND.red};">${esc(data.orderUrl)}</a>`,
          'font-size:13px;',
        )
      : '',
    paragraph(
      SIGN,
      `margin-top:20px;font-family:Georgia,serif;font-size:17px;color:${BRAND.brown};`,
    ),
  ].join('\n')

  const text = [
    `Děkujeme, ${many ? 'poukazy posíláme' : 'poukaz posíláme'} v příloze (PDF).`,
    '',
    `Dobrý den, ${data.firstName},`,
    `děkujeme za objednávku č. ${data.orderNumber}.`,
    '',
    `${many ? 'POUKAZY ZAČNOU' : 'POUKAZ ZAČNE'} PLATIT, JAKMILE NÁM DORAZÍ PLATBA. Prosíme o úhradu převodem do ${due}.`,
    '',
    'PLATEBNÍ ÚDAJE',
    paymentText(data.payment),
    '',
    many ? 'VAŠE POUKAZY' : 'VÁŠ POUKAZ',
    ...data.vouchers.map(
      (v) => `${v.code} – ${czk(v.value)}, platnost do ${formatIsoDay(v.expiresOn)}`,
    ),
    data.pdfUrl ? `PDF: ${data.pdfUrl}` : '',
    '',
    'JAK POUKAZ UPLATNIT',
    'Při objednávce na terrys.cz zaškrtněte „Zaplatím částečně dárkovým poukazem Terrys“ a zadejte kód (v prodejně ho stačí ukázat). Hodnotu odečteme při vyúčtování; poukaz lze čerpat postupně až do data platnosti. Kód chraňte jako hotovost.',
    '',
    SIGN,
    data.shop.companyLine ?? '',
  ]
    .filter((line) => line !== '')
    .join('\n')

  return {
    subject,
    html: emailLayout({
      title: subject,
      preheader: `${many ? 'Poukazy' : 'Poukaz'} v příloze. Zaplaťte ${czk(data.payment.amount)} do ${due} (VS ${data.payment.variableSymbol}).`,
      body,
      footer: footer(data.shop),
    }),
    text,
  }
}

/** Staff marked the bank payment as received. */
export function voucherPaidEmail(data: VoucherEmailData): RenderedEmail {
  const many = data.vouchers.length > 1
  const subject = `Platba přijata – ${many ? 'poukazy jsou platné' : 'poukaz je platný'} (objednávka č. ${data.orderNumber})`
  const body = [
    `<h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${BRAND.brown};">Platba dorazila, ${many ? 'poukazy platí' : 'poukaz platí'}</h1>`,
    paragraph(`Dobrý den, ${esc(data.firstName)},`),
    paragraph(
      `děkujeme, platbu ${esc(czk(data.payment.amount))} za objednávku č.&nbsp;${esc(data.orderNumber)} jsme přijali. ${many ? 'Poukazy lze' : 'Poukaz lze'} od teď uplatnit.`,
    ),
    vouchersTable(data),
    data.pdfUrl
      ? button(data.pdfUrl, many ? 'Stáhnout poukazy (PDF)' : 'Stáhnout poukaz (PDF)')
      : '',
    paragraph(
      SIGN,
      `margin-top:20px;font-family:Georgia,serif;font-size:17px;color:${BRAND.brown};`,
    ),
  ].join('\n')
  const text = [
    `Dobrý den, ${data.firstName},`,
    `platbu ${czk(data.payment.amount)} za objednávku č. ${data.orderNumber} jsme přijali. ${many ? 'Poukazy lze' : 'Poukaz lze'} od teď uplatnit.`,
    ...data.vouchers.map(
      (v) => `${v.code} – ${czk(v.value)}, platnost do ${formatIsoDay(v.expiresOn)}`,
    ),
    data.pdfUrl ? `PDF: ${data.pdfUrl}` : '',
    '',
    SIGN,
  ]
    .filter(Boolean)
    .join('\n')
  return {
    subject,
    html: emailLayout({
      title: subject,
      preheader: `Platba za objednávku č. ${data.orderNumber} přijata.`,
      body,
      footer: footer(data.shop),
    }),
    text,
  }
}

/** One reminder after the due time (setting `overdueAction`). */
export function voucherReminderEmail(data: VoucherEmailData): RenderedEmail {
  const many = data.vouchers.length > 1
  const subject = `Připomínka platby – dárkov${many ? 'é poukazy' : 'ý poukaz'} Terrys, objednávka č. ${data.orderNumber}`
  const contact = [data.shop.contactPhone, data.shop.contactEmail].filter(Boolean).join(' nebo ')
  const body = [
    `<h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${BRAND.brown};">Platbu za ${many ? 'poukazy' : 'poukaz'} jsme zatím nedostali</h1>`,
    paragraph(`Dobrý den, ${esc(data.firstName)},`),
    paragraph(
      `k objednávce č.&nbsp;${esc(data.orderNumber)} nám zatím nedorazila platba. Pokud jste už zaplatili, omlouváme se – převod může trvat den či dva a tento e-mail můžete ignorovat. ${many ? 'Poukazy začnou' : 'Poukaz začne'} platit po přijetí platby.`,
    ),
    paymentBox(data.payment),
    contact
      ? paragraph(
          `Pokud ${many ? 'poukazy' : 'poukaz'} nechcete, stačí nám dát vědět: ${esc(contact)}.`,
        )
      : '',
    paragraph(
      SIGN,
      `margin-top:20px;font-family:Georgia,serif;font-size:17px;color:${BRAND.brown};`,
    ),
  ].join('\n')
  const text = [
    `Dobrý den, ${data.firstName},`,
    `k objednávce č. ${data.orderNumber} nám zatím nedorazila platba. Pokud jste už zaplatili, tento e-mail ignorujte.`,
    '',
    paymentText(data.payment),
    contact ? `\nPokud ${many ? 'poukazy' : 'poukaz'} nechcete, dejte nám vědět: ${contact}.` : '',
    '',
    SIGN,
  ]
    .filter(Boolean)
    .join('\n')
  return {
    subject,
    html: emailLayout({
      title: subject,
      preheader: `Platba ${czk(data.payment.amount)}, VS ${data.payment.variableSymbol}.`,
      body,
      footer: footer(data.shop),
    }),
    text,
  }
}
