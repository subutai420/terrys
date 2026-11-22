import type { PriceUnit } from '@/lib/catalog'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import { formatCzk, formatUnitPrice } from '@/lib/format'
import type { LineResolution } from '@/lib/orders/constants'
import { formatDateInSentence, formatDateLong, UNIT_LABEL } from '@/lib/orders/format'
import { formatWeight } from '@/lib/productView'

import type { RenderedEmail } from './order'
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
 * Stage 5 customer e-mails while fulfilling an order (same building blocks as stage 4):
 * final price after weighing, "on the way" (courier tracking / own van), ready for pickup,
 * cancellation. Pure functions, unit-tested in `emails.test.ts`.
 */

export type FulfilmentEmailData = {
  orderNumber: string
  firstName: string
  lines: {
    title: string
    variantLabel?: string | null
    quantity: number
    unitPrice: number
    priceUnit: PriceUnit
    actualWeightGrams?: number | null
    finalPrice?: number | null
    resolution?: LineResolution | null
    weighNote?: string | null
  }[]
  goodsFinal: number
  deliveryPrice: number
  totalFinal: number
  vouchers: { code: string; amount: number }[]
  amountDue: number
  delivery: { methodName: string; methodType: ShippingMethodType; date: string } | null
  address?: string | null
  pickup?: { name: string; address: string; openingHours: string[] } | null
  tracking?: { number: string; url: string | null } | null
  cancellationReason?: string | null
  shop: {
    siteUrl: string
    contactEmail?: string | null
    contactPhone?: string | null
    companyLine?: string | null
  }
}

const czk = (value: number) => formatCzk(value)

function lineName(line: FulfilmentEmailData['lines'][number]) {
  return line.variantLabel ? `${line.title} – ${line.variantLabel}` : line.title
}

function lineDetail(line: FulfilmentEmailData['lines'][number]): string {
  if (line.resolution === 'unavailable') {
    return `Bohužel není k dispozici – neúčtujeme${line.weighNote ? ` (${line.weighNote})` : ''}`
  }
  const parts = [`${formatUnitPrice(line.unitPrice)} / ${UNIT_LABEL[line.priceUnit]}`]
  if (line.priceUnit !== 'piece' && line.actualWeightGrams) {
    parts.unshift(`zváženo ${formatWeight(line.actualWeightGrams)}`)
  }
  if (line.resolution === 'substituted' && line.weighNote) parts.push(`náhrada: ${line.weighNote}`)
  return parts.join(' · ')
}

function finalTableHtml(data: FulfilmentEmailData): string {
  const cell = `padding:10px 6px;border-bottom:1px solid ${BRAND.line};font-size:14px;vertical-align:top;`
  const rows = data.lines
    .map(
      (line) => `<tr>
<td style="${cell}"><strong>${esc(lineName(line))}</strong><br><span style="color:${BRAND.muted};font-size:13px;">${esc(lineDetail(line))}</span></td>
<td style="${cell}text-align:center;white-space:nowrap;">${line.quantity}&times;</td>
<td style="${cell}text-align:right;white-space:nowrap;">${esc(czk(line.finalPrice ?? 0))}</td>
</tr>`,
    )
    .join('')
  const total = (label: string, value: string, strong = false) =>
    `<tr><td colspan="2" style="padding:6px;font-size:14px;text-align:right;${strong ? 'font-weight:bold;' : `color:${BRAND.muted};`}">${esc(label)}</td><td style="padding:6px;font-size:${strong ? '17px' : '14px'};text-align:right;white-space:nowrap;${strong ? `font-weight:bold;color:${BRAND.red};` : ''}">${value}</td></tr>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><th align="left" style="padding:6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;border-bottom:2px solid ${BRAND.brown};">Položka</th><th style="padding:6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;border-bottom:2px solid ${BRAND.brown};">Počet</th><th align="right" style="padding:6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;border-bottom:2px solid ${BRAND.brown};">Cena</th></tr>
${rows}
${total('Zboží celkem', esc(czk(data.goodsFinal)))}
${data.delivery ? total(data.delivery.methodName, data.deliveryPrice > 0 ? esc(czk(data.deliveryPrice)) : 'zdarma') : ''}
${total('Celkem vč. DPH', esc(czk(data.totalFinal)), data.vouchers.length === 0)}
${data.vouchers.map((v) => total(`Uhrazeno dárkovým poukazem ${v.code}`, `−${esc(czk(v.amount))}`)).join('')}
${data.vouchers.length ? total('Zbývá zaplatit', esc(czk(data.amountDue)), true) : ''}
</table>`
}

function finalText(data: FulfilmentEmailData): string {
  const lines = data.lines.map(
    (line) =>
      `- ${lineName(line)}: ${line.quantity}× (${lineDetail(line)}) = ${czk(line.finalPrice ?? 0)}`,
  )
  lines.push(`Zboží celkem: ${czk(data.goodsFinal)}`)
  if (data.delivery) {
    lines.push(
      `${data.delivery.methodName}: ${data.deliveryPrice > 0 ? czk(data.deliveryPrice) : 'zdarma'}`,
    )
  }
  lines.push(`CELKEM vč. DPH: ${czk(data.totalFinal)}`)
  for (const v of data.vouchers)
    lines.push(`Uhrazeno dárkovým poukazem ${v.code}: −${czk(v.amount)}`)
  if (data.vouchers.length) lines.push(`ZBÝVÁ ZAPLATIT: ${czk(data.amountDue)}`)
  return lines.join('\n')
}

function payWhere(data: FulfilmentEmailData): string {
  if (data.delivery?.methodType === 'pickup') return 'při vyzvednutí'
  if (data.delivery?.methodType === 'courier') return 'kurýrovi při převzetí zásilky (dobírka)'
  return 'našemu řidiči při převzetí'
}

function payHtml(data: FulfilmentEmailData): string {
  if (data.amountDue <= 0) {
    return notice('<strong>Objednávka je celá uhrazená dárkovým poukazem.</strong> Nic neplatíte.')
  }
  return notice(
    `<strong>K zaplacení: ${esc(czk(data.amountDue))}</strong> – ${esc(payWhere(data))}, hotově nebo kartou.`,
  )
}

function payText(data: FulfilmentEmailData): string {
  return data.amountDue <= 0
    ? 'Objednávka je celá uhrazená dárkovým poukazem. Nic neplatíte.'
    : `K ZAPLACENÍ: ${czk(data.amountDue)} – ${payWhere(data)}, hotově nebo kartou.`
}

function contactLine(data: FulfilmentEmailData): string {
  return [data.shop.contactPhone, data.shop.contactEmail].filter(Boolean).join(' nebo ')
}

function footer(data: FulfilmentEmailData): string {
  const contacts = contactLine(data)
  return [
    contacts ? `Dotazy k objednávce: ${esc(contacts)}<br>` : '',
    data.shop.companyLine ? `${esc(data.shop.companyLine)}<br>` : '',
    `<a href="${esc(data.shop.siteUrl)}" style="color:#ffffff;">${esc(data.shop.siteUrl.replace(/^https?:\/\//, ''))}</a>`,
  ].join('')
}

const h1 = (text: string) =>
  `<h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${BRAND.brown};">${esc(text)}</h1>`

const signature = () =>
  paragraph(
    'Těší se na vás řezníci z Terrysu',
    `margin-top:20px;font-family:Georgia,serif;font-size:17px;color:${BRAND.brown};`,
  )

function render(
  data: FulfilmentEmailData,
  subject: string,
  preheader: string,
  body: string[],
  text: string[],
): RenderedEmail {
  return {
    subject,
    html: emailLayout({
      title: subject,
      preheader,
      body: body.filter(Boolean).join('\n'),
      footer: footer(data),
    }),
    text: [...text, '', 'Těší se na vás řezníci z Terrysu', data.shop.companyLine ?? '']
      .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
      .join('\n')
      .trim(),
  }
}

function whenText(data: FulfilmentEmailData): string {
  const d = data.delivery
  if (!d) return ''
  return d.methodType === 'pickup'
    ? `Připravíme ji k vyzvednutí ${formatDateInSentence(d.date)}.`
    : `Dovezeme ji ${formatDateInSentence(d.date)}.`
}

/** After weighing and the staff check: final price per item, total, amount to pay, date. */
export function finalPriceEmail(data: FulfilmentEmailData): RenderedEmail {
  const subject = `Objednávka č. ${data.orderNumber} je zvážená – k zaplacení ${czk(data.amountDue)} | Terrys Steak`
  return render(
    data,
    subject,
    `Výsledná cena podle skutečné hmotnosti: ${czk(data.totalFinal)}.`,
    [
      h1(`Objednávka č. ${data.orderNumber} je zvážená`),
      paragraph(`Dobrý den, ${esc(data.firstName)},`),
      paragraph(
        `řezník vaši objednávku naporcoval a zvážil. Tady je výsledná cena podle skutečné hmotnosti. ${esc(whenText(data))}`,
      ),
      heading('Výsledná cena'),
      finalTableHtml(data),
      payHtml(data),
      data.delivery
        ? keyValueTable([
            [
              data.delivery.methodType === 'pickup' ? 'Vyzvednutí' : 'Doručení',
              `<strong>${esc(formatDateLong(data.delivery.date))}</strong>`,
            ],
            ['Způsob', esc(data.delivery.methodName)],
            data.delivery.methodType === 'pickup'
              ? ['Kde', data.pickup ? esc(`${data.pickup.name}, ${data.pickup.address}`) : null]
              : ['Adresa', data.address ? esc(data.address) : null],
          ])
        : '',
      contactLine(data)
        ? paragraph(`Nesedí vám něco? Ozvěte se: ${esc(contactLine(data))}.`, 'margin-top:16px;')
        : '',
      signature(),
    ],
    [
      `Objednávka č. ${data.orderNumber} je zvážená`,
      '',
      `Dobrý den, ${data.firstName},`,
      `řezník vaši objednávku naporcoval a zvážil. Výsledná cena podle skutečné hmotnosti: ${whenText(data)}`,
      '',
      finalText(data),
      '',
      payText(data),
      data.delivery ? `${data.delivery.methodName}, ${formatDateLong(data.delivery.date)}` : '',
      contactLine(data) ? `Nesedí vám něco? ${contactLine(data)}` : '',
    ],
  )
}

/** Courier: tracking link. Own van: "our driver is on the way on <date>". */
export function shippedEmail(data: FulfilmentEmailData): RenderedEmail {
  const courier = data.delivery?.methodType === 'courier'
  const date = data.delivery ? formatDateInSentence(data.delivery.date) : ''
  const subject = courier
    ? `Objednávka č. ${data.orderNumber} je na cestě – sledování zásilky | Terrys Steak`
    : `Objednávka č. ${data.orderNumber}: náš řidič k vám vyráží ${date} | Terrys Steak`
  const intro = courier
    ? 'vaši objednávku jsme předali kurýrovi. Zásilku můžete sledovat pod tímto číslem:'
    : `náš řidič vám objednávku přiveze ${date}. Chlazené maso převezměte prosím osobně a hned ho dejte do lednice.`
  return render(
    data,
    subject,
    courier ? `Číslo zásilky ${data.tracking?.number ?? ''}` : `Doručení ${date}`,
    [
      h1(courier ? 'Vaše objednávka je na cestě' : 'Vezeme vám objednávku'),
      paragraph(`Dobrý den, ${esc(data.firstName)},`),
      paragraph(esc(intro)),
      courier && data.tracking
        ? keyValueTable([['Číslo zásilky', `<strong>${esc(data.tracking.number)}</strong>`]])
        : '',
      courier && data.tracking?.url ? button(data.tracking.url, 'Sledovat zásilku') : '',
      data.address ? keyValueTable([['Adresa doručení', esc(data.address)]]) : '',
      payHtml(data),
      signature(),
    ],
    [
      courier ? 'Vaše objednávka je na cestě' : 'Vezeme vám objednávku',
      '',
      `Dobrý den, ${data.firstName},`,
      intro,
      courier && data.tracking ? `Číslo zásilky: ${data.tracking.number}` : '',
      courier && data.tracking?.url ? `Sledování: ${data.tracking.url}` : '',
      data.address ? `Adresa doručení: ${data.address}` : '',
      payText(data),
    ],
  )
}

/** Pickup: place, opening hours (when filled), amount to pay. */
export function readyForPickupEmail(data: FulfilmentEmailData): RenderedEmail {
  const date = data.delivery ? formatDateInSentence(data.delivery.date) : ''
  const subject = `Objednávka č. ${data.orderNumber} je připravená k vyzvednutí | Terrys Steak`
  const place = data.pickup
  return render(
    data,
    subject,
    `Vyzvednutí ${date}${place ? `, ${place.name}` : ''}.`,
    [
      h1('Objednávka je připravená k vyzvednutí'),
      paragraph(`Dobrý den, ${esc(data.firstName)},`),
      paragraph(`vaše objednávka č. ${esc(data.orderNumber)} na vás čeká ${esc(date)}.`),
      place
        ? keyValueTable([
            ['Kde', `<strong>${esc(place.name)}</strong><br>${esc(place.address)}`],
            [
              'Otevírací doba',
              place.openingHours.length ? place.openingHours.map(esc).join('<br>') : null,
            ],
          ])
        : '',
      payHtml(data),
      signature(),
    ],
    [
      'Objednávka je připravená k vyzvednutí',
      '',
      `Dobrý den, ${data.firstName},`,
      `vaše objednávka č. ${data.orderNumber} na vás čeká ${date}.`,
      place ? `Kde: ${place.name}, ${place.address}` : '',
      place?.openingHours.length ? `Otevírací doba:\n${place.openingHours.join('\n')}` : '',
      payText(data),
    ],
  )
}

/** Cancellation with the reason. */
export function cancelledEmail(data: FulfilmentEmailData): RenderedEmail {
  const subject = `Objednávka č. ${data.orderNumber} je zrušená | Terrys Steak`
  return render(
    data,
    subject,
    `Objednávku č. ${data.orderNumber} jsme zrušili.`,
    [
      h1(`Objednávka č. ${data.orderNumber} je zrušená`),
      paragraph(`Dobrý den, ${esc(data.firstName)},`),
      paragraph('vaši objednávku jsme zrušili. Nic jste neplatili, takže vám nic nevracíme.'),
      data.cancellationReason
        ? heading('Důvod') + paragraph(escMultiline(data.cancellationReason))
        : '',
      contactLine(data)
        ? paragraph(`Pokud jde o omyl nebo máte dotaz, ozvěte se: ${esc(contactLine(data))}.`)
        : '',
      paragraph('Omlouváme se a budeme rádi, když to u nás zkusíte znovu.'),
      signature(),
    ],
    [
      `Objednávka č. ${data.orderNumber} je zrušená`,
      '',
      `Dobrý den, ${data.firstName},`,
      'vaši objednávku jsme zrušili. Nic jste neplatili, takže vám nic nevracíme.',
      data.cancellationReason ? `Důvod: ${data.cancellationReason}` : '',
      contactLine(data) ? `Dotazy: ${contactLine(data)}` : '',
    ],
  )
}
