import type { CheerioRoot } from '../html'
import { absoluteImageUrl, cleanText, loadHtml } from '../html'
import { htmlToLexical, type RichTextResult } from '../richtext'
import { type ExtractedSeo, legacyPath, parseCzechDate, productLinksIn, seoFromPage } from './common'

/**
 * Content pages of the old site: magazine and Terrys Academy articles, glossary terms
 * ("Slovník pojmů"), recipes and static pages.
 */

export interface ExtractedArticle {
  kind: 'magazine' | 'academy' | 'glossary'
  legacyUrl: string
  oldId?: number
  title: string
  publishedAt?: string
  authorName?: string
  /** Rubric on the old site ("Rady a tipy") – the new model has no article categories. */
  rubric?: string
  coverImage?: string
  content: RichTextResult
  relatedProducts: string[]
  seo: ExtractedSeo
  warnings: string[]
}

export interface ExtractedIngredient {
  amount?: string
  unit?: string
  name: string
}

export interface ExtractedStep {
  text: string
  image?: string
}

export interface ExtractedRecipe {
  legacyUrl: string
  oldId?: number
  title: string
  authorName?: string
  rubric?: string
  coverImage?: string
  perex?: string
  ingredients: ExtractedIngredient[]
  steps: ExtractedStep[]
  /** Everything of the body that is not in ingredients/steps (intro, tips, photos, links). */
  content: RichTextResult
  relatedProducts: string[]
  seo: ExtractedSeo
  warnings: string[]
}

export interface ExtractedPage {
  legacyUrl: string
  title: string
  content: RichTextResult
  seo: ExtractedSeo
  warnings: string[]
}

const idFrom = (path: string) => {
  const m = /-detail-(\d+)/.exec(path)
  return m ? Number(m[1]) : undefined
}

/** Author from `.blogDAutorName` ("Autor: Tým Terrys"). */
function authorOf($: CheerioRoot): string | undefined {
  const box = $('.blogDetail .blogDAutorName').first().clone()
  box.find('span').first().remove()
  return cleanText(box.text()) || undefined
}

/** Body of a blog-like detail (`.blogDBox`) without the cover image and social widgets. */
function blogBody($: CheerioRoot) {
  const body = $('.blogDetail .blogDBox').first().clone()
  body.find('.cornerImgBox, .blogDImg, script, .RelatedList, .relatedProducts, .relatedMagazin, .blogDIco').remove()
  return body
}

/** Images of the popup gallery below an article, as `<img>` HTML appended to the body. */
function galleryHtml($: CheerioRoot, body: ReturnType<CheerioRoot>): string {
  const imgs: string[] = []
  body.find('.galRow a[href]').each((_, a) => {
    const alt = $(a).find('img').attr('alt') ?? ''
    imgs.push(`<p><img src="${$(a).attr('href')}" alt="${alt.replace(/"/g, '&quot;')}"></p>`)
  })
  body.find('.galRow').remove()
  return imgs.join('')
}

function coverOf($: CheerioRoot, pageUrl: string): string | undefined {
  const img = $('.blogDetail .cornerImgBox img').first().attr('src')
  if (!img) return undefined
  // Prefer the large (800 px) filter used for article photos.
  const large = img.replace(/Filter=[0-9a-f-]+/i, 'Filter=042cdaac-4610-40de-a462-c4d4435cec81')
  return absoluteImageUrl(large, pageUrl) ?? undefined
}

export function extractArticle(html: string, pageUrl: string): ExtractedArticle {
  const $ = loadHtml(html)
  const legacyUrl = legacyPath($, pageUrl)
  const kind: ExtractedArticle['kind'] = /^\/pojmy\//.test(legacyUrl)
    ? 'glossary'
    : /^\/academy/.test(legacyUrl)
      ? 'academy'
      : 'magazine'
  const warnings: string[] = []

  if (kind === 'glossary') {
    // Glossary term: `#conceptsDetail .boxMain800` with h1 + text, products in a slider below.
    const box = $('#conceptsDetail .boxMain800').first().clone()
    const title = cleanText(box.find('h1').first().text())
    box.find('h1, .btnMore, .cleaner').remove()
    return {
      kind,
      legacyUrl,
      oldId: idFrom(legacyUrl),
      title,
      content: htmlToLexical(box.html() ?? '', { pageUrl, defaultAlt: title }),
      relatedProducts: productLinksIn($, '#conceptsProducts', pageUrl),
      seo: seoFromPage($),
      warnings,
    }
  }

  const title = cleanText($('.blogDetail .blogDTitle h1').first().text()) || cleanText($('h1').first().text())
  const body = blogBody($)
  const gallery = galleryHtml($, body)
  const content = htmlToLexical((body.html() ?? '') + gallery, { pageUrl, defaultAlt: title })
  return {
    kind,
    legacyUrl,
    oldId: idFrom(legacyUrl),
    title,
    publishedAt: parseCzechDate($('.blogDetail .blogDDate').first().text()),
    authorName: authorOf($),
    rubric: cleanText($('.blogDetail .blogDAutorRub .blogCat').first().text()) || undefined,
    coverImage: coverOf($, pageUrl),
    content,
    relatedProducts: productLinksIn($, '.blogDetail .relatedProducts, .blogDetail .RelatedList', pageUrl),
    seo: seoFromPage($),
    warnings,
  }
}

/** "1 kg farmářského masa" → { amount: "1", unit: "kg", name: "farmářského masa" }. */
export function parseIngredient(text: string): ExtractedIngredient {
  const t = cleanText(text)
  const m = /^(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|½|¼|\d+\/\d+)\s*(kg|g|dkg|ml|dl|l|ks|lžíce|lžíc|lžičky|lžička|lžic|stroužky|stroužek|stroužků|hrnek|hrnky|plátky|plátků|špetka|svazek|balení|kusy|kus)?\.?\s+(.+)$/i.exec(t)
  if (!m) return { name: t }
  return { amount: m[1].replace(/\s+/g, ''), unit: m[2] || undefined, name: m[3] }
}

export function extractRecipe(html: string, pageUrl: string): ExtractedRecipe {
  const $ = loadHtml(html)
  const legacyUrl = legacyPath($, pageUrl)
  const title = cleanText($('.blogDetail .blogDTitle h1').first().text()) || cleanText($('h1').first().text())
  const warnings: string[] = []
  const body = blogBody($)

  // Ingredients box (`.blogDIngredients`): lists with optional group headings ("Na dresink:").
  const ingredients: ExtractedIngredient[] = []
  body.find('.blogDIngredients').children().each((_, el) => {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag) || tag === 'p') {
      const heading = cleanText($(el).text())
      // The first heading is usually just "Co budete potřebovat?" – not a group.
      if (heading && !/co budete pot[řr]ebovat/i.test(heading)) ingredients.push({ name: heading.replace(/:?$/, ':') })
    } else if (tag === 'ul' || tag === 'ol') {
      $(el)
        .children('li')
        .each((_, li) => {
          const text = cleanText($(li).text())
          if (text) ingredients.push(parseIngredient(text))
        })
    }
  })
  body.find('.blogDBoxL').remove()
  body.find('.blogDBoxR').remove()

  // Steps: the first numbered list after a "Postup" heading (else the only <ol> in the body),
  // or the paragraphs right after a "Jak postupovat?" / "Postup" heading up to the next heading.
  const steps: ExtractedStep[] = []
  const isStepsHeading = (el: Parameters<typeof $>[0]) => /^(postup|jak postupovat)/i.test(cleanText($(el).text()))
  const isHeadingLike = (el: Parameters<typeof $>[0]) => {
    const $el = $(el)
    if (/^h[1-6]$/i.test((el as { tagName?: string }).tagName ?? '')) return true
    // <p><strong>Na dresink:</strong></p> works as a sub-heading on the old site.
    const strong = cleanText($el.children('strong, b').text())
    return strong.length > 0 && strong === cleanText($el.text()) && strong.length < 80
  }
  let stepsList = body.find('h2, h3, p').filter((_, el) => isStepsHeading(el)).first().nextAll('ol').first()
  if (!stepsList.length && body.find('ol').length === 1) stepsList = body.find('ol').first()
  if (stepsList.length) {
    stepsList.children('li').each((_, li) => {
      const imgs = $(li).find('img')
      const image = absoluteImageUrl(imgs.first().attr('src'), pageUrl) ?? undefined
      const text = cleanText($(li).text())
      if (text) steps.push({ text, image })
      if (imgs.length > 1) warnings.push(`krok „${text.slice(0, 40)}…“ má ${imgs.length} fotky, přenesena první`)
    })
    // Keep the heading "Postup" out of the remaining rich text too.
    stepsList.prevAll('h2, h3, p').filter((_, el) => isStepsHeading(el)).first().remove()
    stepsList.remove()
  } else {
    const heading = body.children('h2, h3, p').filter((_, el) => isStepsHeading(el) && isHeadingLike(el)).first()
    if (heading.length) {
      const paragraphs = []
      for (let el = heading.next(); el.length && el.is('p') && !isHeadingLike(el[0]); el = el.next()) paragraphs.push(el)
      if (paragraphs.length >= 2) {
        for (const p of paragraphs) {
          const text = cleanText(p.text())
          const image = absoluteImageUrl(p.find('img').first().attr('src'), pageUrl) ?? undefined
          if (text) steps.push({ text, image })
          p.remove()
        }
        heading.remove()
      }
    }
  }

  const perexEl = body.children('p').first()
  const perex = cleanText(perexEl.text()) || undefined
  if (perex) perexEl.remove()

  const content = htmlToLexical(body.html() ?? '', { pageUrl, defaultAlt: title })
  if (!steps.length) warnings.push('postup není strukturovaný (číslovaný seznam), ponechán jako text receptu')
  if (!ingredients.length) warnings.push('suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu')

  return {
    legacyUrl,
    oldId: idFrom(legacyUrl),
    title,
    authorName: authorOf($),
    rubric: cleanText($('.blogDetail .blogDAutorRub .blogCat').first().text()) || undefined,
    coverImage: coverOf($, pageUrl),
    perex,
    ingredients,
    steps,
    content,
    relatedProducts: productLinksIn($, '.blogDetail .RelatedList', pageUrl),
    seo: seoFromPage($),
    warnings,
  }
}

/**
 * Static page: the content is everything after the page's h1 inside the same container
 * (`.boxMain`, `.sheetR`, …), so the shared header/footer is never included.
 */
export function extractStaticPage(html: string, pageUrl: string): ExtractedPage {
  const $ = loadHtml(html)
  const legacyUrl = legacyPath($, pageUrl)
  const h1 = $('h1').first()
  const title = cleanText(h1.text()) || cleanText($('head title').text())
  const warnings: string[] = []
  let contentHtml = ''
  if (h1.length) {
    const container = h1.parent()
    const clone = container.clone()
    clone.find('script, form, .cleaner').remove()
    // Drop the h1 and anything before it.
    const children = clone.contents().toArray()
    const idx = children.findIndex((c) => c.type === 'tag' && (c as { tagName?: string }).tagName === 'h1')
    contentHtml = children
      .slice(idx + 1)
      .map((c) => $.html(c))
      .join('')
  } else {
    warnings.push('stránka nemá nadpis h1 – obsah nelze spolehlivě vyříznout')
  }
  const content = htmlToLexical(contentHtml, { pageUrl, defaultAlt: title })
  if (!content.doc) warnings.push('stránka nemá žádný text (obsah je asi skládaný skriptem nebo z widgetů)')
  return { legacyUrl, title, content, seo: seoFromPage($), warnings }
}

/** Recipe difficulty from listing cards ("Obtížnost: Náročné") by recipe path. */
export function extractRecipeDifficulties(html: string, pageUrl: string): Map<string, string> {
  const $ = loadHtml(html)
  const out = new Map<string, string>()
  $('a.plItem[href*="/recepty/"]').each((_, a) => {
    const href = $(a).attr('href') ?? ''
    const path = /\/recepty\/[^?#]+-detail-\d+/.exec(new URL(href, pageUrl).pathname)?.[0]
    const diff = cleanText($(a).find('.plDiff strong').first().text())
    if (path && diff) out.set(path, diff)
  })
  return out
}

/** Article perex from listing cards (`.blogWrap` / `.magazin`) by article path. */
export function extractArticlePerexes(html: string, pageUrl: string): Map<string, string> {
  const $ = loadHtml(html)
  const out = new Map<string, string>()
  $('a.blogWrap[href], .magazinR a[href]').each((_, a) => {
    const href = $(a).attr('href') ?? ''
    let path: string
    try {
      path = new URL(href, pageUrl).pathname
    } catch {
      return
    }
    const text = cleanText($(a).find('.blogWrapText, .magazinText').first().text())
    if (/-detail-\d+/.test(path) && text) out.set(path, text)
  })
  return out
}
