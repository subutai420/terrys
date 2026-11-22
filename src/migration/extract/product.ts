import type { Availability, PriceUnit } from '@/lib/catalog'

import { absoluteImageUrl, cleanText, loadHtml } from '../html'
import { htmlToLexical, type RichTextResult } from '../richtext'
import {
  type ExtractedSeo,
  formatWeightLabel,
  legacyPath,
  parseCzechNumber,
  parseWeightGrams,
  productLinksIn,
  seoFromPage,
} from './common'

/**
 * Product detail page of the old shop (/produkty/<slug>-detail-<id>).
 *
 * Markup (EasyWeb template): `#boxPld` with `h1[itemprop=name]`, `.pldType` (cut), `.pldText`
 * (short description), `.pldData` rows (Původ, Velikost kusu, Dostupnost, Trvanlivost,
 * Skladování, Zrání masa), `.variantItem` divs with data-shop-product-price per variant (each
 * variant twice: "porcovane" and "neporcovane"), `.porcovaniItem` (portioning choice),
 * `.productIntendedList .active` (usages), `.thumbGallery` (images), `#brownBox .boxPldRef`
 * (longer story text) and related products / recipe further down.
 */

export interface ExtractedVariant {
  label: string
  kind: 'weight' | 'piece'
  weightGrams?: number
  /** Price of the variant on the old site (incl. VAT). Only used to derive the unit price. */
  oldPrice: number
  /** How the weight was found: from the label, the piece size, or computed from the price. */
  weightSource: 'label' | 'piece-size' | 'price'
}

export interface ExtractedProduct {
  oldId: number
  legacyUrl: string
  /** The old site renders no product box (product switched off). */
  hiddenOnOldSite: boolean
  ewObjectId?: string
  title: string
  cutText?: string
  originText?: string
  /** "Dodavatel" row → `brand`. */
  supplierText?: string
  pieceSizeText?: string
  availabilityText?: string
  availability: Availability
  availabilityKnown: boolean
  shelfLifeText?: string
  storageText?: string
  chilledOrFrozen?: string
  agingText?: string
  labels: string[]
  usages: string[]
  shortDescription: RichTextResult
  description: RichTextResult
  /** Unit price derived from the variants (or the listed price when there are none). */
  price?: number
  priceUnit: PriceUnit
  priceNote?: string
  /** Struck-through original prices that differ from the current price (sale on the old site). */
  originalPriceDiffers: { variant: string; price: number; original: number }[]
  variants: ExtractedVariant[]
  portioningOptions: string[]
  images: string[]
  relatedProducts: string[]
  relatedRecipes: string[]
  categoryOldId?: number
  categoryPath?: string
  seo: ExtractedSeo
  warnings: string[]
}

const AVAILABILITY_MAP: [RegExp, Availability][] = [
  [/^skladem/i, 'in-stock'],
  // "dle aktuální zásoby" and "Na objednávku" have no own status in the new model (see report).
  [/dle aktu[aá]ln[ií] z[aá]soby/i, 'in-stock'],
  [/na objedn[aá]vku/i, 'in-stock'],
  [/na\s+cest/i, 'in-transit'],
  [/vyprod|nedostup|není skladem|neni skladem|momentálně ne|dočasně ne/i, 'sold-out'],
]

export function mapAvailability(text: string | undefined): { value: Availability; known: boolean } {
  const t = cleanText(text)
  for (const [re, value] of AVAILABILITY_MAP) if (re.test(t)) return { value, known: true }
  return { value: 'in-stock', known: false }
}

/** "/ 1 kg" → kg, "/ 100 g" → 100g, anything else (ks, balení, …) → piece. */
export function priceUnitFromText(text: string | undefined): PriceUnit | undefined {
  const t = cleanText(text).toLowerCase()
  if (!t) return undefined
  if (/100\s*g/.test(t)) return '100g'
  if (/(^|\s|\/)1?\s*kg/.test(t)) return 'kg'
  return 'piece'
}

/** Variant labels meaning a whole/half piece, a count or a package rather than a cut weight. */
const PIECE_LABEL_RE = /cel[ýyéáe]|ce[ýy]\s*kus|kus|p[ůu]l|1\/2|\bks\b|\d\s*ks|bal[eí]n|filet|hřbet|výseč/i

interface RawVariant {
  label: string
  price: number
  original?: number
}

const UNIT_GRAMS: Record<Exclude<PriceUnit, 'piece'>, number> = { kg: 1000, '100g': 100 }

/**
 * Unit price and variants.
 *
 * The old detail page renders the unit price server-side: `.pldShopPrice` ("990 Kč") with
 * `.pldPriceFor` ("/ 1 kg", "/ 100 g", "/ ks", "/ balení"). (A click on a variant later rewrites
 * these two with the variant's price – we read the HTML as the server sent it.) Every variant
 * also has its own price (250 g = 247,50 Kč, 1ks = 345 Kč, Celý kus = 2 475 Kč).
 *
 * - kg / 100 g products: price = the listed unit price; variant weight = from the label
 *   ("250g"), else "Velikost kusu" (half of it for "1/2 kusu"), else variant price ÷ unit price.
 *   A variant whose price does not match weight × unit price (±5 %) is reported.
 * - ks / balení products: fixed price per piece; variants with different prices are reported
 *   (the new model does not price piece variants).
 * - No listed price: unit price derived from weight variants (price ÷ weight).
 */
export function derivePricing(
  raw: RawVariant[],
  ctx: { pieceGrams?: number; listedPrice?: number; listedUnit?: PriceUnit },
): { price?: number; priceUnit: PriceUnit; priceNote?: string; variants: ExtractedVariant[]; warnings: string[] } {
  const warnings: string[] = []
  let price = ctx.listedPrice
  let priceUnit: PriceUnit | undefined = ctx.listedUnit
  let priceNote = price !== undefined && priceUnit ? 'cena a jednotka podle detailu produktu' : undefined

  if (price === undefined || !priceUnit) {
    const weighed = raw
      .map((v) => ({ v, grams: parseWeightGrams(v.label) }))
      .filter((x): x is { v: RawVariant; grams: number } => Boolean(x.grams))
    if (weighed.length) {
      const perKg = weighed.map((x) => (x.v.price / x.grams) * 1000)
      price = Math.round((perKg.reduce((a, b) => a + b, 0) / perKg.length) * 100) / 100
      priceUnit = 'kg'
      priceNote = 'jednotka na detailu chybí; cena za kg = cena varianty ÷ hmotnost'
    } else if (raw.length) {
      price = raw[0].price
      priceUnit = 'piece'
      priceNote = 'jednotka na detailu chybí; pevná cena první varianty'
    }
    if (priceNote) warnings.push(priceNote)
  }
  priceUnit ??= 'kg'

  const variants: ExtractedVariant[] = []
  if (priceUnit === 'piece') {
    const prices = new Set(raw.map((r) => r.price))
    if (prices.size > 1) {
      warnings.push(
        `cena za kus, varianty se liší cenou (${raw.map((r) => `${r.label} ${r.price} Kč`).join(', ')}) – varianty nepřeneseny`,
      )
    }
    return { price, priceUnit, priceNote, variants, warnings }
  }

  if (price) {
    const gramsPerUnit = UNIT_GRAMS[priceUnit]
    for (const v of raw) {
      const isPiece = PIECE_LABEL_RE.test(v.label)
      const fromPrice = Math.round((v.price / price) * gramsPerUnit)
      let weight = parseWeightGrams(v.label)
      let source: ExtractedVariant['weightSource'] = 'label'
      if (!weight) {
        const isHalf = /p[ůu]l|1\/2/i.test(v.label)
        weight = ctx.pieceGrams ? (isHalf ? ctx.pieceGrams / 2 : ctx.pieceGrams) : undefined
        source = 'piece-size'
        // Counts ("2ks", "3 ks"): n × piece size.
        const count = /^(\d+)\s*(ks|kus)/i.exec(v.label)
        if (count && weight) weight = weight * Number(count[1])
        if (!weight || Math.abs(fromPrice - weight) > weight * 0.05) {
          if (weight) warnings.push(`varianta „${v.label}“: velikost kusu ${weight} g neodpovídá ceně (${fromPrice} g), použita hmotnost podle ceny`)
          weight = fromPrice
          source = 'price'
        }
      } else if (Math.abs(fromPrice - weight) > weight * 0.05) {
        warnings.push(`varianta „${v.label}“ stojí ${v.price} Kč, podle jednotkové ceny by měla ${Math.round((weight / gramsPerUnit) * price)} Kč`)
      }
      variants.push({
        label: isPiece ? cleanText(v.label) : formatWeightLabel(v.label),
        kind: isPiece ? 'piece' : 'weight',
        weightGrams: Math.round(weight),
        oldPrice: v.price,
        weightSource: source,
      })
    }
  }
  return { price, priceUnit, priceNote, variants, warnings }
}

export function extractProduct(html: string, pageUrl: string): ExtractedProduct {
  const $ = loadHtml(html)
  const warnings: string[] = []
  const box = $('#boxPld')
  const legacyUrl = legacyPath($, pageUrl)
  const idFromUrl = Number(/-detail-(\d+)/.exec(legacyUrl)?.[1])
  const oldId = Number(box.find('[data-shop-product-param-name="itemId"]').attr('data-shop-product-param-value')) || idFromUrl

  // A product switched off on the old site still answers 200 but renders no product box; its
  // name is then only in the page context / <title>.
  const hiddenOnOldSite = box.length === 0
  if (hiddenOnOldSite) warnings.push('detail produktu se na starém webu nezobrazuje (vypnutý produkt) – importován jako skrytý koncept')
  const contextTitle = /"productTitle":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1]
  const title =
    cleanText(box.find('h1[itemprop="name"]').first().text()) ||
    (contextTitle ? cleanText(JSON.parse(`"${contextTitle}"`) as string) : '') ||
    cleanText($('head title').first().text())
  const dataRow = (label: RegExp) => {
    let value: string | undefined
    box.find('.pldData > div').each((_, row) => {
      const name = cleanText($(row).children('span').first().text())
      if (label.test(name) && value === undefined) value = cleanText($(row).children('strong').first().text())
    })
    return value || undefined
  }

  const availabilityText = dataRow(/^Dostupnost/i) ?? (cleanText(box.find('.plAvail strong').first().text()) || undefined)
  const { value: availability, known: availabilityKnown } = mapAvailability(availabilityText)
  if (!availabilityKnown && !hiddenOnOldSite) warnings.push(`neznámá dostupnost „${availabilityText ?? ''}“ → Skladem`)

  // Short description: .pldText without the "(více)" button.
  const pldText = box.find('.pldText').first().clone()
  pldText.find('.btnTextMore').remove()
  const shortDescription = htmlToLexical(pldText.html() ?? '', { pageUrl, defaultAlt: title })

  // Longer story ("příběh") in the brown box below the product.
  const story = $('#brownBox .boxPldRef').first().clone()
  const description = htmlToLexical(story.html() ?? '', { pageUrl, defaultAlt: title })

  // Variants: every weight appears twice (porcovane / neporcovane) with the same price.
  const pieceSizeText = dataRow(/^Velikost kusu/i)
  const pieceGrams = parseWeightGrams(pieceSizeText)
  const raw: { label: string; price: number; original?: number }[] = []
  const seen = new Set<string>()
  box.find('.variantItem').each((_, el) => {
    const $el = $(el)
    const label = cleanText($el.attr('data-shop-variant-name') ?? $el.text())
    const price = Number($el.attr('data-shop-product-price'))
    const original = Number($el.attr('data-shop-product-price-original'))
    if (!label || !Number.isFinite(price) || seen.has(label)) return
    seen.add(label)
    raw.push({ label, price, original: Number.isFinite(original) ? original : undefined })
  })

  const originalPriceDiffers = raw
    .filter((v) => v.original !== undefined && Math.abs(v.original - v.price) > 1)
    .map((v) => ({ variant: v.label, price: v.price, original: v.original as number }))

  const listedPrice = parseCzechNumber(box.find('.pldShopPrice').first().text())
  const listedUnit = priceUnitFromText(box.find('.pldPriceFor').first().text())
  const pricing = derivePricing(raw, { pieceGrams, listedPrice, listedUnit })
  warnings.push(...pricing.warnings)
  const { price, priceUnit, priceNote, variants } = pricing

  const portioningOptions = box
    .find('.porcovaniItem')
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean)

  // Images: the large version linked from the gallery (`a[href]`), then the thumbnails' targets.
  const images = new Set<string>()
  box.find('.thumbGallery a[href], .thumbGallery [data-src], .thumbGallery img').each((_, el) => {
    const $el = $(el)
    const candidate = $el.is('a') ? $el.attr('href') : ($el.attr('data-src') ?? (/ew_images\/image\?/.test($el.attr('src') ?? '') ? $el.attr('src') : undefined))
    if (!candidate || candidate === '#') return
    const abs = absoluteImageUrl(candidate, pageUrl)
    if (abs && /\/ew\//.test(abs)) images.add(abs)
  })

  const usages = box
    .find('.productIntendedList > div.active')
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean)

  const labels = [
    ...box.find('.pldSort2 span, .labels span, .labels div[class]').map((_, el) => cleanText($(el).text())).get(),
  ].filter(Boolean)

  // "Související produkty" / "Doplňující produkty" boxes below the product.
  const relatedProducts = productLinksIn($, '.boxPldRelated', pageUrl).filter((p) => p !== legacyUrl)
  const relatedRecipes = new Set<string>()
  $('#brownBox a[href*="/recepty/"], .pldRecipe a[href*="/recepty/"]').each((_, a) => {
    const href = $(a).attr('href') ?? ''
    const m = /\/recepty\/.+-detail-\d+/.exec(href)
    if (m) relatedRecipes.add(m[0])
  })

  // EasyWeb page context: main category of the product.
  const context = /"categoryItemId":(\d+)[^}]*"categoryPath":"([^"]*)"/.exec(html)

  if (price === undefined) warnings.push('cena nenalezena')
  if (!images.size) warnings.push('bez obrázku')

  return {
    oldId,
    legacyUrl,
    hiddenOnOldSite,
    ewObjectId: box.attr('data-shop-product-ew-obj-id'),
    title,
    cutText: cleanText(box.find('.pldType').first().text()) || undefined,
    originText: dataRow(/^Původ/i),
    supplierText: dataRow(/^Dodavatel/i),
    pieceSizeText,
    availabilityText,
    availability,
    availabilityKnown,
    shelfLifeText: dataRow(/^Trvanlivost/i),
    storageText: dataRow(/^Skladování/i),
    chilledOrFrozen:
      cleanText(box.find('.pldSort').not('.pldZrani .pldSort').children('.sortPopupButton').first().text()) ||
      undefined,
    agingText: cleanText(box.find('.pldZrani .sortPopupButton').first().text()) || undefined,
    labels: [...new Set(labels)],
    usages,
    shortDescription,
    description,
    price,
    priceUnit,
    priceNote,
    originalPriceDiffers,
    variants,
    portioningOptions,
    images: [...images],
    relatedProducts: [...new Set(relatedProducts)],
    relatedRecipes: [...relatedRecipes],
    categoryOldId: context ? Number(context[1]) : undefined,
    categoryPath: context ? context[2] : undefined,
    seo: seoFromPage($),
    warnings,
  }
}
