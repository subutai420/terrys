import { readFileSync } from 'node:fs'
import path from 'node:path'

import PDFDocument from 'pdfkit'

import { formatCzk } from '@/lib/format'

/**
 * Gift voucher PDF ("dárkový poukaz") – one A4 page per voucher, made to be forwarded by e-mail
 * or printed at home.
 *
 * Layout (A4 portrait, white paper, only thin gold lines so it does not waste toner):
 *   ┌─ gold double frame ───────────────┐
 *   │ logo, DÁRKOVÝ POUKAZ, 2 000 Kč    │   the voucher itself (can be cut out and put
 *   │ Pro: …, personal message          │   into an envelope)
 *   │ [ KÓD POUKAZU ]  Platnost do …    │
 *   └───────────────────────────────────┘
 *   - - - - - - - - cut line - - - - - - -
 *   Jak poukaz uplatnit (VOUCHER_TERMS) + shop contact
 *
 * Nothing about payment is printed on purpose: the PDF is a gift and the buyer forwards it.
 *
 * Technical notes:
 * - Library: `pdfkit` (MIT). It must not be bundled by Next.js (it reads files at runtime), so it
 *   is listed in `serverExternalPackages` in next.config.ts.
 * - Fonts: Quicksand (SIL OFL 1.1) and Roboto Slab (Apache 2.0) – the storefront fonts – stored
 *   as static TTF instances in src/vouchers/fonts (licence files next to them). Embedded and
 *   subsetted into each PDF, so Czech diacritics render on every device.
 * - The logo is drawn as vector graphics straight from public/img/logo-red.svg (it is a single
 *   SVG path, and pdfkit can draw SVG path data) – sharp is not needed and print stays crisp.
 * - Files are found via process.cwd() (the project root in `next dev/start`, Vitest and
 *   `payload run`). On Vercel the files are added to every server function with
 *   `outputFileTracingIncludes` in next.config.ts.
 */

export type VoucherPdfData = {
  /** Voucher code, printed exactly as given, e.g. 'K7MQ-3XPA-9TC-R4W'. */
  code: string
  /** Value in whole CZK. */
  value: number
  /** Last valid day, 'YYYY-MM-DD'. */
  expiresOn: string
  /** Optional "Pro: …" line. */
  recipientName?: string | null
  /** Optional personal message (≈ 200 characters; longer text is cut with "…"). */
  message?: string | null
  /** Contact block; empty values and placeholders starting with "DOPLNIT" are skipped. */
  shop: {
    name: string
    web: string
    email?: string | null
    phone?: string | null
    address?: string | null
  }
}

/**
 * Terms printed under the cut line. Edit freely (Czech, one bullet per item); keep them short so
 * they fit on the page – about 5 bullets of two lines each.
 */
export const VOUCHER_TERMS: readonly string[] = [
  'Poukaz můžete uplatnit při nákupu na www.terrys.cz i v naší prodejně. Při objednávce zadejte kód poukazu – jeho hodnotu odečteme při vyúčtování objednávky.',
  'Poukaz lze čerpat postupně ve více nákupech, dokud jeho hodnotu nevyčerpáte.',
  'Poukaz nelze vyměnit za hotovost.',
  'Poukaz platí do data uvedeného výše.',
  'Kód chraňte jako hotovost: kód, který už někdo uplatnil, nelze po ztrátě nahradit.',
]

// ---------------------------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------------------------

const FONT_DIR = path.join(process.cwd(), 'src', 'vouchers', 'fonts')
const LOGO_PATH = path.join(process.cwd(), 'public', 'img', 'logo-red.svg')

const FONT_FILES = {
  sans: 'Quicksand-Medium.ttf',
  sansBold: 'Quicksand-Bold.ttf',
  slab: 'RobotoSlab-Regular.ttf',
  slabBold: 'RobotoSlab-Bold.ttf',
} as const
type FontName = keyof typeof FONT_FILES

type Assets = {
  fonts: Record<FontName, Buffer>
  logoPath: string
  logoWidth: number
  logoHeight: number
}
let assets: Assets | null = null

/** Reads fonts and the logo once per server process. */
function loadAssets(): Assets {
  if (assets) return assets
  const fonts = Object.fromEntries(
    Object.entries(FONT_FILES).map(([name, file]) => [
      name,
      readFileSync(path.join(FONT_DIR, file)),
    ]),
  ) as Record<FontName, Buffer>
  const svg = readFileSync(LOGO_PATH, 'utf8')
  const d = /<path[^>]*\sd="([^"]+)"/.exec(svg)?.[1]
  const viewBox = /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg)
  if (!d || !viewBox) throw new Error(`Unexpected logo SVG format: ${LOGO_PATH}`)
  assets = { fonts, logoPath: d, logoWidth: Number(viewBox[1]), logoHeight: Number(viewBox[2]) }
  return assets
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------------------------

/** 'YYYY-MM-DD' → '31. 12. 2027' (Czech date style). */
export function formatVoucherDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) throw new Error(`Voucher expiry must be 'YYYY-MM-DD', got "${isoDate}".`)
  const [, y, m, d] = match
  return `${Number(d)}. ${Number(m)}. ${y}`
}

function isFilled(value: string | null | undefined): value is string {
  return !!value && value.trim() !== '' && !/^doplnit/i.test(value.trim())
}

// ---------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------

// Brand colours (src/app/(frontend)/globals.css @theme).
const C = {
  red: '#b00004',
  brown: '#3a2317',
  ink: '#2b1a11',
  muted: '#5f544c',
  line: '#d3cbc1',
  gold: '#d6cc89',
  goldDark: '#c08a1e', // a touch darker than --color-brand-gold-dark (#d19723) so it prints
  beigeLight: '#f6f3ef', // lighter than --color-brand-beige-light – a hint of colour, no toner
} as const

const PAGE_W = 595.28 // A4 in PDF points
const PAGE_H = 841.89
const CX = PAGE_W / 2

const CARD = { x: 42, y: 42, w: PAGE_W - 84, h: 520 }
const CUT_Y = CARD.y + CARD.h + 24

type Doc = PDFKit.PDFDocument

/** Centered single line; compensates pdfkit's trailing character spacing. */
function centered(
  doc: Doc,
  text: string,
  y: number,
  font: FontName,
  size: number,
  color: string,
  spacing = 0,
): number {
  doc.font(font).fontSize(size).fillColor(color)
  const width = doc.widthOfString(text, { characterSpacing: spacing }) - spacing
  doc.text(text, CX - width / 2, y, { characterSpacing: spacing, lineBreak: false })
  return doc.currentLineHeight(true)
}

/** Largest font size ≤ max (down to min) at which the text fits on one line of `width`. */
function fitSize(doc: Doc, text: string, font: FontName, max: number, min: number, width: number) {
  let size = max
  doc.font(font)
  while (size > min && doc.fontSize(size).widthOfString(text) > width) size -= 0.5
  return size
}

function diamond(doc: Doc, x: number, y: number, r: number, color: string) {
  doc
    .moveTo(x, y - r)
    .lineTo(x + r, y)
    .lineTo(x, y + r)
    .lineTo(x - r, y)
    .closePath()
    .fill(color)
}

/** Short gold rule with a diamond in the middle. */
function ornament(doc: Doc, y: number, halfWidth: number) {
  doc.lineWidth(0.8).strokeColor(C.goldDark)
  doc
    .moveTo(CX - halfWidth, y)
    .lineTo(CX - 9, y)
    .stroke()
  doc
    .moveTo(CX + 9, y)
    .lineTo(CX + halfWidth, y)
    .stroke()
  diamond(doc, CX, y, 3.2, C.goldDark)
}

function drawFrame(doc: Doc) {
  const { x, y, w, h } = CARD
  doc.lineWidth(1.6).strokeColor(C.goldDark).rect(x, y, w, h).stroke()
  const inset = 6
  doc
    .lineWidth(0.6)
    .strokeColor(C.gold)
    .rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset)
    .stroke()
  for (const [cx, cy] of [
    [x + inset, y + inset],
    [x + w - inset, y + inset],
    [x + inset, y + h - inset],
    [x + w - inset, y + h - inset],
  ] as const) {
    diamond(doc, cx, cy, 4, C.goldDark)
  }
}

function drawLogo(doc: Doc, a: Assets, y: number, width: number): number {
  const scale = width / a.logoWidth
  doc.save()
  doc.translate(CX - width / 2, y).scale(scale)
  doc.path(a.logoPath).fill(C.red)
  doc.restore()
  return a.logoHeight * scale
}

function drawVoucherCard(doc: Doc, a: Assets, v: VoucherPdfData) {
  drawFrame(doc)

  // --- top: logo, title, value
  let y = CARD.y + 40
  y += drawLogo(doc, a, y, 168) + 26
  centered(doc, 'DÁRKOVÝ POUKAZ', y, 'sansBold', 15, C.brown, 4.5)
  y += 30
  ornament(doc, y, 70)
  y += 18
  const value = formatCzk(v.value)
  const valueSize = fitSize(doc, value, 'slabBold', 64, 36, CARD.w - 80)
  centered(doc, value, y, 'slabBold', valueSize, C.red)

  // --- bottom of the card (anchored): code box and validity
  const boxW = 318
  const boxH = 58
  const validityY = CARD.y + CARD.h - 44
  const boxY = validityY - 18 - boxH
  doc
    .roundedRect(CX - boxW / 2, boxY, boxW, boxH, 6)
    .lineWidth(0.9)
    .fillAndStroke(C.beigeLight, C.goldDark)
  centered(doc, 'KÓD POUKAZU', boxY + 9, 'sansBold', 7.5, C.muted, 2.2)
  const codeSize = fitSize(doc, v.code, 'slabBold', 23, 12, boxW - 30)
  centered(doc, v.code, boxY + 22, 'slabBold', codeSize, C.ink, 2)

  const validityLabel = 'Platnost do '
  const validityDate = formatVoucherDate(v.expiresOn)
  doc.font('sans').fontSize(11)
  const labelW = doc.widthOfString(validityLabel)
  doc.font('sansBold')
  const dateW = doc.widthOfString(validityDate)
  const vx = CX - (labelW + dateW) / 2
  doc.font('sans').fillColor(C.muted).text(validityLabel, vx, validityY, { lineBreak: false })
  doc
    .font('sansBold')
    .fillColor(C.ink)
    .text(validityDate, vx + labelW, validityY, { lineBreak: false })

  // --- middle: recipient and message, vertically centred in the free space
  const middleTop = y + valueSize * 1.2 + 10
  const middleBottom = boxY - 16
  const recipient = isFilled(v.recipientName) ? v.recipientName.trim() : null
  const message = isFilled(v.message) ? v.message.trim().replace(/\s+/g, ' ').slice(0, 260) : null
  if (!recipient && !message) return

  const msgWidth = 380
  const msgSize = 12.5
  const msgLineGap = 4
  const msgText = message ? `„${message}“` : ''
  const recipientSize = recipient
    ? fitSize(doc, `Pro: ${recipient}`, 'slab', 17, 10, CARD.w - 80)
    : 0
  const recipientH = recipient ? recipientSize * 1.3 : 0
  const gap = recipient && message ? 12 : 0
  // At most 4 lines of message, and never more than the free space above the code box;
  // pdfkit cuts what does not fit and ends the last line with "…".
  doc.font('sans').fontSize(msgSize)
  const lineH = doc.currentLineHeight(true) + msgLineGap
  const freeLines = Math.floor((middleBottom - middleTop - recipientH - gap) / lineH)
  const maxMsgHeight = Math.max(1, Math.min(4, freeLines)) * lineH
  const msgHeight = message
    ? Math.min(maxMsgHeight, doc.heightOfString(msgText, { width: msgWidth, lineGap: msgLineGap }))
    : 0
  const blockH = recipientH + gap + msgHeight
  let my = middleTop + Math.max(0, (middleBottom - middleTop - blockH) / 2)

  if (recipient) {
    doc.font('sans').fontSize(recipientSize)
    const label = 'Pro: '
    const labelWidth = doc.widthOfString(label)
    doc.font('slab')
    const nameWidth = doc.widthOfString(recipient)
    const rx = CX - (labelWidth + nameWidth) / 2
    doc
      .font('sans')
      .fillColor(C.muted)
      .text(label, rx, my + recipientSize * 0.08, { lineBreak: false })
    doc
      .font('slab')
      .fillColor(C.brown)
      .text(recipient, rx + labelWidth, my, { lineBreak: false })
    my += recipientH + gap
  }
  if (message) {
    doc
      .font('sans')
      .fontSize(msgSize)
      .fillColor(C.muted)
      .text(msgText, CX - msgWidth / 2, my, {
        width: msgWidth,
        align: 'center',
        lineGap: msgLineGap,
        height: maxMsgHeight,
        ellipsis: '…',
      })
  }
}

function drawCutLine(doc: Doc) {
  doc
    .lineWidth(0.7)
    .strokeColor(C.line)
    .dash(4, { space: 3 })
    .moveTo(24, CUT_Y)
    .lineTo(PAGE_W - 24, CUT_Y)
    .stroke()
    .undash()
  doc.font('sans').fontSize(7).fillColor(C.muted)
  const label = 'zde odstřihněte'
  const w = doc.widthOfString(label)
  doc.rect(PAGE_W - 42 - w - 6, CUT_Y - 5, w + 12, 10).fill('#ffffff')
  doc.fillColor(C.muted).text(label, PAGE_W - 42 - w, CUT_Y - 3.6, { lineBreak: false })
}

function drawTerms(doc: Doc, v: VoucherPdfData) {
  const x = CARD.x + 8
  const width = CARD.w - 16
  let y = CUT_Y + 22
  doc
    .font('slabBold')
    .fontSize(14)
    .fillColor(C.brown)
    .text('Jak poukaz uplatnit', x, y, { lineBreak: false })
  y += 28

  const bulletIndent = 14
  for (const term of VOUCHER_TERMS) {
    diamond(doc, x + 3, y + 6, 2.4, C.goldDark)
    doc
      .font('sans')
      .fontSize(10)
      .fillColor(C.ink)
      .text(term, x + bulletIndent, y, { width: width - bulletIndent, lineGap: 2.5 })
    y = doc.y + 6
  }

  // Contact block at the bottom of the page.
  const { shop } = v
  const contactItems = [
    shop.web.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    shop.email,
    shop.phone,
    shop.address,
  ].filter(isFilled)
  const footerY = PAGE_H - 62
  doc
    .lineWidth(0.6)
    .strokeColor(C.gold)
    .moveTo(x, footerY)
    .lineTo(x + width, footerY)
    .stroke()
  if (isFilled(shop.name)) {
    doc
      .font('slabBold')
      .fontSize(10.5)
      .fillColor(C.brown)
      .text(shop.name, x, footerY + 12, { width, align: 'center', lineBreak: false })
  }
  if (contactItems.length) {
    doc
      .font('sans')
      .fontSize(9.5)
      .fillColor(C.muted)
      .text(contactItems.join('   ·   '), x, footerY + 29, { width, align: 'center' })
  }
}

/**
 * Renders the vouchers into one PDF (one A4 page per voucher) and returns it as a Buffer,
 * e.g. for an e-mail attachment or a download response.
 */
export async function renderVoucherPdf(vouchers: VoucherPdfData[]): Promise<Buffer> {
  if (vouchers.length === 0) throw new Error('renderVoucherPdf: no vouchers given.')
  const a = loadAssets()

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: false,
    // Use our own font from the start: pdfkit would otherwise load its built-in Helvetica
    // metrics from disk, which is one more file to ship to the server.
    font: path.join(FONT_DIR, FONT_FILES.sans),
    info: {
      Title: vouchers.length === 1 ? 'Dárkový poukaz' : 'Dárkové poukazy',
      Author: vouchers[0]!.shop.name,
      Creator: vouchers[0]!.shop.name,
    },
    lang: 'cs-CZ',
  })
  for (const name of Object.keys(FONT_FILES) as FontName[]) doc.registerFont(name, a.fonts[name])

  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  for (const voucher of vouchers) {
    doc.addPage({ size: 'A4', margin: 0 })
    drawVoucherCard(doc, a, voucher)
    drawCutLine(doc)
    drawTerms(doc, voucher)
  }
  doc.end()
  return done
}
