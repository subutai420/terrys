import { BRAND, emailLayout, esc, escMultiline, keyValueTable, paragraph } from './layout'
import type { RenderedEmail } from './order'

/**
 * Withdrawal e-mails (stage 4). The customer confirmation is the "acknowledgement of receipt on a
 * durable medium": it repeats the full content of the withdrawal and the date and time it was
 * sent (Directive 2023/2673, Art. 11a; Czech § 1830a OZ from 1. 1. 2027 as proposed).
 * Neutral wording on purpose: whether the right applies is assessed afterwards.
 */

export type WithdrawalEmailData = {
  name: string
  email: string
  phone?: string | null
  orderNumber: string
  items?: string | null
  message?: string | null
  /** ISO timestamp of the submission. */
  submittedAt: string
  matchedOrder: boolean
  shop: {
    siteUrl: string
    contactEmail?: string | null
    contactPhone?: string | null
    companyLine?: string | null
  }
}

const pragueTime = (iso: string) =>
  new Date(iso).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    dateStyle: 'long',
    timeStyle: 'medium',
  })

function contentRows(data: WithdrawalEmailData): [string, string | null][] {
  return [
    ['Odesláno', esc(pragueTime(data.submittedAt))],
    ['Jméno', esc(data.name)],
    ['E-mail', esc(data.email)],
    ['Telefon', data.phone ? esc(data.phone) : null],
    ['Číslo objednávky', esc(data.orderNumber)],
    ['Čeho se týká', data.items ? escMultiline(data.items) : 'celé objednávky'],
    ['Zpráva', data.message ? escMultiline(data.message) : null],
  ]
}

function contentText(data: WithdrawalEmailData): string {
  return [
    `Odesláno: ${pragueTime(data.submittedAt)}`,
    `Jméno: ${data.name}`,
    `E-mail: ${data.email}`,
    data.phone ? `Telefon: ${data.phone}` : '',
    `Číslo objednávky: ${data.orderNumber}`,
    `Čeho se týká: ${data.items || 'celé objednávky'}`,
    data.message ? `Zpráva: ${data.message}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function withdrawalConfirmationEmail(data: WithdrawalEmailData): RenderedEmail {
  const subject = `Potvrzení přijetí odstoupení od smlouvy (objednávka ${data.orderNumber}) | Terrys Steak`
  const contact = [data.shop.contactPhone, data.shop.contactEmail].filter(Boolean).join(' nebo ')
  const body = [
    `<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:22px;color:${BRAND.brown};">Vaše odstoupení od smlouvy jsme přijali</h1>`,
    paragraph(`Dobrý den,`),
    paragraph(
      `potvrzujeme, že jsme ${esc(pragueTime(data.submittedAt))} přijali vaše oznámení o odstoupení od smlouvy s tímto obsahem:`,
    ),
    keyValueTable(contentRows(data)),
    paragraph(
      'Ozveme se vám s dalším postupem (vrácení zboží a peněz). Tento e-mail si prosím uschovejte jako doklad.',
      'margin-top:16px;',
    ),
    contact ? paragraph(`Dotazy: ${esc(contact)}.`) : '',
    paragraph(
      'Řezníci z Terrysu',
      `margin-top:20px;font-family:Georgia,serif;color:${BRAND.brown};`,
    ),
  ].join('\n')
  const text = [
    'Vaše odstoupení od smlouvy jsme přijali',
    '',
    `Potvrzujeme, že jsme ${pragueTime(data.submittedAt)} přijali vaše oznámení o odstoupení od smlouvy s tímto obsahem:`,
    contentText(data),
    '',
    'Ozveme se vám s dalším postupem (vrácení zboží a peněz). Tento e-mail si prosím uschovejte jako doklad.',
    contact ? `Dotazy: ${contact}` : '',
    '',
    'Řezníci z Terrysu',
    data.shop.companyLine ?? '',
  ]
    .filter((line) => line !== '')
    .join('\n')
  return {
    subject,
    html: emailLayout({
      title: subject,
      preheader: `Přijato ${pragueTime(data.submittedAt)}`,
      body,
      footer: esc(data.shop.companyLine ?? data.shop.siteUrl),
    }),
    text,
  }
}

export function withdrawalInternalEmail(data: WithdrawalEmailData): RenderedEmail {
  const subject = `Odstoupení od smlouvy – objednávka ${data.orderNumber}${data.matchedOrder ? '' : ' (NEDOHLEDÁNA)'}`
  const body = [
    `<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:22px;color:${BRAND.brown};">Odstoupení od smlouvy</h1>`,
    paragraph(
      data.matchedOrder
        ? 'Objednávka byla dohledána a odstoupení je u ní v administraci.'
        : '<strong>Objednávku se podle čísla a e-mailu nepodařilo dohledat</strong> – ověřte ručně.',
    ),
    keyValueTable(contentRows(data)),
    paragraph(
      'Posuďte, zda se odstoupení vztahuje na objednané zboží (potraviny podléhající rychlé zkáze obvykle ne), a zákazníka kontaktujte.',
      'margin-top:16px;',
    ),
  ].join('\n')
  return {
    subject,
    html: emailLayout({
      title: subject,
      preheader: data.name,
      body,
      footer: 'Interní zpráva e-shopu.',
    }),
    text: `${subject}\n\n${contentText(data)}`,
  }
}
