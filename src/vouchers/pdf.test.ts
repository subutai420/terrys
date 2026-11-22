import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, it } from 'vitest'

import { type VoucherPdfData, VOUCHER_TERMS, formatVoucherDate, renderVoucherPdf } from './pdf'
import { pdfToPngPages } from './pdfPreview'

const SAMPLE: VoucherPdfData = {
  code: 'K7MQ-3XPA-9TC-R4W',
  value: 2000,
  expiresOn: '2027-12-31',
  recipientName: 'Jana Nováková',
  message: 'Všechno nejlepší k narozeninám! Ať se steaky povedou.',
  shop: { name: 'Terrys – řeznictví a steaky', web: 'www.terrys.cz', email: 'info@terrys.cz' },
}

/** Text of each page; non-breaking spaces turned into normal ones for easy matching. */
async function pageTexts(pdf: Buffer): Promise<string[]> {
  const doc = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(doc, { mergePages: false })
  return text.map((t) => t.replace(/[  ]/g, ' ').replace(/[ \t]+/g, ' '))
}

describe('formatVoucherDate', () => {
  it('formats in Czech style', () => {
    expect(formatVoucherDate('2027-12-31')).toBe('31. 12. 2027')
    expect(formatVoucherDate('2027-01-05')).toBe('5. 1. 2027')
    expect(() => formatVoucherDate('31.12.2027')).toThrow()
  })
})

describe('renderVoucherPdf', () => {
  it('renders the code, value, expiry and Czech text intact', async () => {
    const pdf = await renderVoucherPdf([SAMPLE])
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    const [text] = await pageTexts(pdf)
    expect(text).toContain('K7MQ-3XPA-9TC-R4W')
    expect(text).toContain('2 000 Kč')
    expect(text).toContain('31. 12. 2027')
    // Letter-spaced heading: PDF.js reports the wide gaps as spaces.
    expect(text.replace(/ /g, '')).toContain('DÁRKOVÝPOUKAZ')
    expect(text).toContain('Jana Nováková')
    expect(text).toContain('Všechno nejlepší k narozeninám! Ať se steaky povedou.')
    expect(text).toContain('Terrys – řeznictví a steaky')
    expect(text).toContain('info@terrys.cz')
    expect(text).toContain('Jak poukaz uplatnit')
    expect(text).toContain('nelze vyměnit za hotovost')
    // No payment information on a gift.
    expect(text).not.toMatch(/zaplacen|uhrazen|platb/i)
  })

  it('renders every Czech letter with diacritics', async () => {
    const letters = 'ěščřžýáíéůú ĚŠČŘŽÝÁÍÉŮÚ ďťň ĎŤŇ'
    const [text] = await pageTexts(await renderVoucherPdf([{ ...SAMPLE, message: letters }]))
    expect(text).toContain(letters)
  })

  it('makes one page per voucher and skips optional / placeholder values', async () => {
    const pdf = await renderVoucherPdf([
      SAMPLE,
      {
        ...SAMPLE,
        code: 'QW3E-RT5Y-UPA-9SD',
        value: 500,
        recipientName: null,
        message: '   ',
        shop: { ...SAMPLE.shop, phone: 'DOPLNIT telefon', address: '' },
      },
      { ...SAMPLE, code: 'ZX7C-VB8N-MKE-3HJ', value: 12500 },
    ])
    const texts = await pageTexts(pdf)
    expect(texts).toHaveLength(3)
    expect(texts[1]).toContain('QW3E-RT5Y-UPA-9SD')
    expect(texts[1]).toContain('500 Kč')
    expect(texts[1]).not.toContain('Pro:')
    expect(texts[1]).not.toContain('DOPLNIT')
    expect(texts[2]).toContain('12 500 Kč')
  })

  it('keeps all terms in the document', async () => {
    const [text] = await pageTexts(await renderVoucherPdf([SAMPLE]))
    const flat = text.replace(/\s+/g, ' ')
    for (const term of VOUCHER_TERMS) expect(flat).toContain(term)
  })

  it('rejects an empty list', async () => {
    await expect(renderVoucherPdf([])).rejects.toThrow()
  })

  // Dev only: VOUCHER_PDF_PREVIEW=1 writes docs/screenshots/etapa-7/poukaz-pdf.png (see pdfPreview.ts).
  it.runIf(!!process.env.VOUCHER_PDF_PREVIEW)(
    'writes the preview screenshot',
    async () => {
      const longMessage =
        'Milá Jano, k narozeninám ti přejeme hodně zdraví, štěstí a hlavně spoustu povedených ' +
        'steaků na grilu. Ať ti chutná a ať se ti daří přesně tak, jak si zasloužíš! Užij si to ' +
        'a pozvi nás na ochutnávku. Petr a Lucie z Brna'
      const pdf = await renderVoucherPdf([
        SAMPLE,
        { ...SAMPLE, recipientName: 'Ing. Bohuslava Křižíková-Šťastná', message: longMessage },
      ])
      const pages = await pdfToPngPages(pdf, { scale: 2 })
      const dir = path.join(process.cwd(), 'docs', 'screenshots', 'etapa-7')
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, 'poukaz-pdf.png'), pages[0]!)
      if (process.env.VOUCHER_PDF_PREVIEW_ALL) {
        pages.forEach((png, i) => writeFileSync(path.join(dir, `poukaz-pdf-${i + 1}.tmp.png`), png))
        writeFileSync(path.join(dir, 'poukaz-pdf.tmp.pdf'), pdf)
      }
    },
    60_000,
  )
})
