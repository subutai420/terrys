import type { PriceUnit } from '@/lib/catalog'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import { formatPostcode } from '@/lib/delivery/constants'
import { formatCzk, formatUnitPrice } from '@/lib/format'
import { WEIGHT_TOLERANCE } from '@/lib/productView'
import {
  addressLine,
  dateMeaning,
  formatDateInSentence,
  formatDateLong,
  UNIT_LABEL,
  weightText,
} from '@/lib/orders/format'
import { ADDRESS_CHECK_LABELS, type AddressCheckStatus } from '@/lib/orders/constants'
import type { VatRow } from '@/lib/orders/money'

import {
  BRAND,
  button,
  emailLayout,
  esc,
  escMultiline,
  heading,
  keyValueTable,
  notice,
  paragraph,
} from './layout'

/**
 * Order e-mails (stage 4): (a) confirmation to the customer, (b) internal copy for the shop –
 * the safety net that must contain everything needed to fulfil the order if the admin were down.
 * Pure functions: data in, { subject, html, text } out (unit-tested in `emails.test.ts`).
 */

export type OrderEmailData = {
  orderNumber: string
  /** ISO timestamp of the order. */
  createdAt: string
  customer: {
    firstName: string
    lastName: string
    email: string
    phone: string
    companyName?: string | null
    ico?: string | null
    dic?: string | null
  }
  lines: {
    title: string
    variantLabel?: string | null
    quantity: number
    unitPrice: number
    priceUnit: PriceUnit
    vatRate: string
    estimatedWeightGrams?: number | null
    estimatedPrice: number
    sku?: string | null
  }[]
  totals: {
    goodsEstimate: number
    deliveryPrice: number
    totalEstimate: number
    vat: VatRow[]
  }
  delivery: {
    methodName: string
    methodType: ShippingMethodType
    date: string
    postcode: string
    pickupLocation?: {
      name?: string | null
      street?: string | null
      city?: string | null
      zip?: string | null
      openingHoursNote?: string | null
    } | null
  } | null
  address?: { street?: string | null; city?: string | null; postcode?: string | null } | null
  addressCheck?: { status?: string | null; note?: string | null } | null
  note?: string | null
  voucherCode?: string | null
  consents?: { newsletter?: boolean | null; heurekaOptOut?: boolean | null }
  attribution?: Record<string, string | null | undefined> | null
  shop: {
    siteUrl: string
    contactEmail?: string | null
    contactPhone?: string | null
    companyLine?: string | null
    priceNotice: string
  }
  /** Link to the thank-you page (order summary) – customer e-mail only. */
  orderUrl?: string
  withdrawalUrl: string
}

export type RenderedEmail = { subject: string; html: string; text: string }

const czk = (value: number) => formatCzk(value)
const percent = Math.round(WEIGHT_TOLERANCE * 100)

function lineName(line: OrderEmailData['lines'][number]): string {
  return line.variantLabel ? `${line.title} – ${line.variantLabel}` : line.title
}

function linesTableHtml(data: OrderEmailData, internal: boolean): string {
  const cell = `padding:10px 6px;border-bottom:1px solid ${BRAND.line};font-size:14px;vertical-align:top;`
  const rows = data.lines
    .map((line) => {
      const weight = weightText(line.estimatedWeightGrams, line.quantity)
      const details = [
        `${formatUnitPrice(line.unitPrice)} / ${UNIT_LABEL[line.priceUnit]}`,
        weight ? `odhad ${weight}` : null,
        internal ? `DPH ${line.vatRate} %` : null,
        internal && line.sku ? `kód ${line.sku}` : null,
      ]
        .filter(Boolean)
        .map((part) => esc(part))
        .join(' · ')
      return `<tr>
<td style="${cell}"><strong>${esc(lineName(line))}</strong><br><span style="color:${BRAND.muted};font-size:13px;">${details}</span></td>
<td style="${cell}text-align:center;white-space:nowrap;">${line.quantity}&times;</td>
<td style="${cell}text-align:right;white-space:nowrap;">${line.priceUnit === 'piece' ? '' : '≈&nbsp;'}${esc(czk(line.estimatedPrice))}</td>
</tr>`
    })
    .join('')
  const total = (label: string, value: string, strong = false) =>
    `<tr><td colspan="2" style="padding:6px;font-size:14px;text-align:right;${strong ? 'font-weight:bold;' : `color:${BRAND.muted};`}">${esc(label)}</td><td style="padding:6px;font-size:${strong ? '16px' : '14px'};text-align:right;white-space:nowrap;${strong ? `font-weight:bold;color:${BRAND.red};` : ''}">${value}</td></tr>`
  const delivery = data.delivery
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><th align="left" style="padding:6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;border-bottom:2px solid ${BRAND.brown};">Položka</th><th style="padding:6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;border-bottom:2px solid ${BRAND.brown};">Počet</th><th align="right" style="padding:6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;border-bottom:2px solid ${BRAND.brown};">Odhad ceny</th></tr>
${rows}
${total('Odhad za zboží', `≈&nbsp;${esc(czk(data.totals.goodsEstimate))}`)}
${delivery ? total(delivery.methodName, data.totals.deliveryPrice > 0 ? esc(czk(data.totals.deliveryPrice)) : 'zdarma') : ''}
${total('Odhad celkem vč. DPH', `≈&nbsp;${esc(czk(data.totals.totalEstimate))}`, true)}
</table>`
}

function linesText(data: OrderEmailData, internal: boolean): string {
  const lines = data.lines.map((line) => {
    const weight = weightText(line.estimatedWeightGrams, line.quantity)
    return `- ${lineName(line)}: ${line.quantity}× (${formatUnitPrice(line.unitPrice)} / ${UNIT_LABEL[line.priceUnit]}${weight ? `, odhad ${weight}` : ''}${internal ? `, DPH ${line.vatRate} %${line.sku ? `, kód ${line.sku}` : ''}` : ''}) ≈ ${czk(line.estimatedPrice)}`
  })
  lines.push(`Odhad za zboží: ≈ ${czk(data.totals.goodsEstimate)}`)
  if (data.delivery) {
    lines.push(
      `${data.delivery.methodName}: ${data.totals.deliveryPrice > 0 ? czk(data.totals.deliveryPrice) : 'zdarma'}`,
    )
  }
  lines.push(`ODHAD CELKEM vč. DPH: ≈ ${czk(data.totals.totalEstimate)}`)
  return lines.join('\n')
}

function pickupText(data: OrderEmailData): string | null {
  const place = data.delivery?.pickupLocation
  if (!place) return null
  return [place.name, addressLine(place)].filter(Boolean).join(', ')
}

function deliveryRows(data: OrderEmailData): [string, string | null][] {
  const delivery = data.delivery
  if (!delivery) return []
  const isPickup = delivery.methodType === 'pickup'
  return [
    ['Způsob', esc(delivery.methodName)],
    [dateMeaning(delivery.methodType), `<strong>${esc(formatDateLong(delivery.date))}</strong>`],
    isPickup
      ? ['Kde vyzvednout', esc(pickupText(data) ?? '')]
      : ['Adresa doručení', esc(data.address ? addressLine(data.address) : '')],
    isPickup && delivery.pickupLocation?.openingHoursNote
      ? ['Otevírací doba', esc(delivery.pickupLocation.openingHoursNote)]
      : ['', null],
  ]
}

function customerRows(data: OrderEmailData): [string, string | null][] {
  const c = data.customer
  return [
    ['Jméno', esc(`${c.firstName} ${c.lastName}`)],
    ['E-mail', esc(c.email)],
    ['Telefon', esc(c.phone)],
    ['Firma', c.companyName ? esc(c.companyName) : null],
    ['IČO', c.ico ? esc(c.ico) : null],
    ['DIČ', c.dic ? esc(c.dic) : null],
  ]
}

/** The shop's price notice, completed with the ±15 % range when the owner's text lacks it. */
function estimateSentence(data: OrderEmailData): string {
  const notice = data.shop.priceNotice.trim()
  const base =
    'Každou objednávku řezník před expedicí zváží a výsledná cena se řídí skutečnou hmotností'
  if (notice.includes(`±${percent}`) || notice.includes(`${percent} %`)) return notice
  return `${notice ? `${notice} ` : ''}${base} – obvykle se od odhadu liší do ±${percent} %.`
}

function estimateNoticeHtml(data: OrderEmailData): string {
  return notice(
    `<strong>Ceny jsou odhad.</strong> ${esc(estimateSentence(data))}<br><br><strong>Platíte až při převzetí</strong> – ${data.delivery?.methodType === 'pickup' ? 'na výdejním místě' : 'řidiči'}, hotově nebo kartou${data.delivery?.methodType === 'pickup' ? ' (pokud u výdejního místa není uvedeno jinak)' : ''}. Nic jste zatím neplatili.`,
  )
}

function footerHtml(data: OrderEmailData): string {
  const contacts = [
    data.shop.contactPhone ? `tel. ${esc(data.shop.contactPhone)}` : null,
    data.shop.contactEmail
      ? `<a href="mailto:${esc(data.shop.contactEmail)}" style="color:#ffffff;">${esc(data.shop.contactEmail)}</a>`
      : null,
  ].filter(Boolean)
  return [
    contacts.length ? `Dotazy k objednávce: ${contacts.join(' · ')}<br>` : '',
    data.shop.companyLine ? `${esc(data.shop.companyLine)}<br>` : '',
    `<a href="${esc(data.shop.siteUrl)}" style="color:#ffffff;">${esc(data.shop.siteUrl.replace(/^https?:\/\//, ''))}</a>`,
  ].join('')
}

/** (a) Confirmation to the customer. */
export function orderConfirmationEmail(data: OrderEmailData): RenderedEmail {
  const subject = `Přijali jsme vaši objednávku č. ${data.orderNumber} | Terrys Steak`
  const delivery = data.delivery
  const isPickup = delivery?.methodType === 'pickup'
  const what = delivery
    ? isPickup
      ? `Připravíme ji k vyzvednutí ${formatDateInSentence(delivery.date)}.`
      : `Dovezeme ji ${formatDateInSentence(delivery.date)}.`
    : ''
  const contactLine = [data.shop.contactPhone, data.shop.contactEmail]
    .filter(Boolean)
    .join(' nebo ')

  const body = [
    `<h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${BRAND.brown};">Děkujeme, objednávku č.&nbsp;${esc(data.orderNumber)} jsme přijali</h1>`,
    paragraph(`Dobrý den, ${esc(data.customer.firstName)},`),
    paragraph(`děkujeme za objednávku. ${esc(what)}`),
    estimateNoticeHtml(data),
    heading('Co jste si objednali'),
    linesTableHtml(data, false),
    data.voucherCode
      ? paragraph(
          `Kód dárkového poukazu: <strong>${esc(data.voucherCode)}</strong>. Poukaz ověříme a jeho hodnotu odečteme při vážení.`,
          'margin-top:12px;',
        )
      : '',
    heading(isPickup ? 'Vyzvednutí' : 'Doručení'),
    keyValueTable(deliveryRows(data)),
    heading('Vaše údaje'),
    keyValueTable(customerRows(data)),
    data.note ? heading('Poznámka pro řezníka') + paragraph(escMultiline(data.note)) : '',
    heading('Co bude dál'),
    paragraph(
      `1. Řezník maso naporcuje a zváží.<br>2. ${isPickup ? 'Objednávku si vyzvednete' : 'Objednávku vám dovezeme'} v uvedený termín.<br>3. Zaplatíte částku podle skutečné hmotnosti${isPickup ? '' : ' (včetně dopravy)'}.`,
    ),
    contactLine
      ? paragraph(`Potřebujete něco změnit? Napište nebo zavolejte: ${esc(contactLine)}.`)
      : '',
    data.orderUrl ? button(data.orderUrl, 'Shrnutí objednávky') : '',
    paragraph(
      `Informace o odstoupení od smlouvy najdete v obchodních podmínkách; formulář pro odstoupení je na <a href="${esc(data.withdrawalUrl)}" style="color:${BRAND.red};">${esc(data.withdrawalUrl.replace(/^https?:\/\//, ''))}</a>.`,
      `font-size:13px;color:${BRAND.muted};`,
    ),
    paragraph(
      'Těší se na vás řezníci z Terrysu',
      `margin-top:20px;font-family:Georgia,serif;font-size:17px;color:${BRAND.brown};`,
    ),
  ].join('\n')

  const text = [
    `Děkujeme, objednávku č. ${data.orderNumber} jsme přijali`,
    '',
    `Dobrý den, ${data.customer.firstName},`,
    `děkujeme za objednávku. ${what}`,
    '',
    `CENY JSOU ODHAD. ${estimateSentence(data)}`,
    `PLATÍTE AŽ PŘI PŘEVZETÍ – ${isPickup ? 'na výdejním místě' : 'řidiči'}, hotově nebo kartou. Nic jste zatím neplatili.`,
    '',
    'CO JSTE SI OBJEDNALI',
    linesText(data, false),
    data.voucherCode
      ? `Kód dárkového poukazu: ${data.voucherCode} (ověříme ho a jeho hodnotu odečteme při vážení).`
      : '',
    '',
    isPickup ? 'VYZVEDNUTÍ' : 'DORUČENÍ',
    delivery
      ? `${delivery.methodName}, ${dateMeaning(delivery.methodType).toLowerCase()}: ${formatDateLong(delivery.date)}`
      : '',
    isPickup ? (pickupText(data) ?? '') : data.address ? addressLine(data.address) : '',
    '',
    'VAŠE ÚDAJE',
    `${data.customer.firstName} ${data.customer.lastName}, ${data.customer.email}, ${data.customer.phone}`,
    data.customer.companyName
      ? `${data.customer.companyName}${data.customer.ico ? `, IČO ${data.customer.ico}` : ''}${data.customer.dic ? `, DIČ ${data.customer.dic}` : ''}`
      : '',
    data.note ? `\nPOZNÁMKA PRO ŘEZNÍKA\n${data.note}` : '',
    '',
    'CO BUDE DÁL',
    `1. Řezník maso naporcuje a zváží. 2. ${isPickup ? 'Objednávku si vyzvednete' : 'Objednávku vám dovezeme'} v uvedený termín. 3. Zaplatíte částku podle skutečné hmotnosti.`,
    contactLine ? `Potřebujete něco změnit? ${contactLine}` : '',
    data.orderUrl ? `Shrnutí objednávky: ${data.orderUrl}` : '',
    `Odstoupení od smlouvy: ${data.withdrawalUrl}`,
    '',
    'Těší se na vás řezníci z Terrysu',
    data.shop.companyLine ?? '',
  ]
    .filter((line) => line !== '')
    .join('\n')

  return {
    subject,
    html: emailLayout({
      title: subject,
      preheader: `Objednávka č. ${data.orderNumber}: odhad ≈ ${czk(data.totals.totalEstimate)}, platíte až při převzetí.`,
      body,
      footer: footerHtml(data),
    }),
    text,
  }
}

const checkLabel = (status: string) => ADDRESS_CHECK_LABELS[status as AddressCheckStatus] ?? status

/** (b) Internal copy for the shop – everything needed to fulfil the order without the admin. */
export function orderInternalEmail(data: OrderEmailData): RenderedEmail {
  const delivery = data.delivery
  const subject = `Nová objednávka č. ${data.orderNumber} – ${delivery ? `${delivery.methodName}, ${formatDateLong(delivery.date)}` : 'bez dopravy'} – ≈ ${czk(data.totals.totalEstimate)}`
  const placed = new Date(data.createdAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })
  const vatRows = data.totals.vat.map(
    (row) =>
      `${row.rate} %: základ ${formatUnitPrice(row.base)}, DPH ${formatUnitPrice(row.vat)}, celkem ${formatUnitPrice(row.gross)}`,
  )
  const attribution = Object.entries(data.attribution ?? {}).filter(([, value]) => Boolean(value))

  const body = [
    `<h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:22px;color:${BRAND.brown};">Objednávka č. ${esc(data.orderNumber)}</h1>`,
    paragraph(
      `Přijata ${esc(placed)}. Ceny jsou odhad – zvážit a doplnit skutečnou cenu.`,
      `color:${BRAND.muted};`,
    ),
    heading('Doprava'),
    keyValueTable([
      ...deliveryRows(data),
      ['PSČ v košíku', delivery ? esc(formatPostcode(delivery.postcode)) : null],
      [
        'Kontrola adresy',
        data.addressCheck?.status
          ? esc(
              `${checkLabel(data.addressCheck.status)}${data.addressCheck.note ? ` – ${data.addressCheck.note}` : ''}`,
            )
          : null,
      ],
    ]),
    heading('Zákazník'),
    keyValueTable(customerRows(data)),
    heading('Položky'),
    linesTableHtml(data, true),
    paragraph(
      esc(`Rozpis DPH z odhadu: ${vatRows.join('; ')}`),
      `margin-top:12px;font-size:13px;color:${BRAND.muted};`,
    ),
    data.voucherCode
      ? notice(
          `<strong>Dárkový poukaz (NEOVĚŘENO):</strong> ${esc(data.voucherCode)} – ověřit a odečíst při vážení.`,
        )
      : '',
    data.note ? heading('Poznámka zákazníka') + paragraph(escMultiline(data.note)) : '',
    heading('Souhlasy'),
    keyValueTable([
      ['Newsletter', data.consents?.newsletter ? 'ANO' : 'ne'],
      [
        'Dotazník Heureka',
        data.consents?.heurekaOptOut ? 'NEPOSÍLAT (zákazník nesouhlasí)' : 'lze poslat',
      ],
    ]),
    attribution.length
      ? heading('Odkud přišel') +
        keyValueTable(attribution.map(([key, value]) => [key, esc(value)] as [string, string]))
      : '',
  ].join('\n')

  const text = [
    `OBJEDNÁVKA č. ${data.orderNumber} (přijata ${placed}) – ceny jsou odhad`,
    '',
    'DOPRAVA',
    delivery
      ? `${delivery.methodName}; ${dateMeaning(delivery.methodType)}: ${formatDateLong(delivery.date)}; PSČ v košíku ${formatPostcode(delivery.postcode)}`
      : 'bez dopravy',
    delivery?.methodType === 'pickup'
      ? `Vyzvednutí: ${pickupText(data) ?? ''}`
      : `Adresa: ${data.address ? addressLine(data.address) : ''}`,
    data.addressCheck?.status
      ? `Kontrola adresy: ${checkLabel(data.addressCheck.status)} ${data.addressCheck.note ?? ''}`
      : '',
    '',
    'ZÁKAZNÍK',
    `${data.customer.firstName} ${data.customer.lastName}; ${data.customer.email}; ${data.customer.phone}`,
    data.customer.companyName
      ? `Firma: ${data.customer.companyName}; IČO ${data.customer.ico ?? '-'}; DIČ ${data.customer.dic ?? '-'}`
      : '',
    '',
    'POLOŽKY',
    linesText(data, true),
    `DPH z odhadu: ${vatRows.join('; ')}`,
    data.voucherCode ? `DÁRKOVÝ POUKAZ (NEOVĚŘENO): ${data.voucherCode}` : '',
    data.note ? `\nPOZNÁMKA ZÁKAZNÍKA\n${data.note}` : '',
    '',
    `Newsletter: ${data.consents?.newsletter ? 'ANO' : 'ne'}; Heureka dotazník: ${data.consents?.heurekaOptOut ? 'NEPOSÍLAT' : 'lze poslat'}`,
    attribution.length
      ? `Odkud přišel: ${attribution.map(([k, v]) => `${k}=${v}`).join('; ')}`
      : '',
  ]
    .filter((line) => line !== '')
    .join('\n')

  return {
    subject,
    html: emailLayout({
      title: subject,
      preheader: `${data.customer.firstName} ${data.customer.lastName}, ${data.customer.phone}`,
      body,
      footer: 'Interní kopie objednávky z e-shopu Terrys.cz. Neposílejte ji zákazníkovi.',
    }),
    text,
  }
}
