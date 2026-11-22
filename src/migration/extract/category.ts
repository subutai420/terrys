import { absoluteImageUrl, cleanText, loadHtml } from '../html'
import { htmlToLexical, type RichTextResult } from '../richtext'
import { normalizeUrl, toPathAndQuery } from '../urls'
import { type ExtractedSeo, legacyPath, seoFromPage } from './common'

/**
 * Category listing page (/produkty/<slug>-<id>, pagination /produkty/<slug>-<id>/<n>).
 * `h1.titleH1`, `.categoryDescription` (intro text), product cards `#boxPl .plWrap a`,
 * pager `ul.cspager`. The left menu `.leftSelect` holds the whole category tree (see menuTree).
 */
export interface ExtractedCategory {
  oldId: number
  legacyUrl: string
  title: string
  intro: RichTextResult
  seo: ExtractedSeo
  /** Product detail paths listed on this page. */
  productLinks: string[]
  /** Other pages of the same listing ("/produkty/x-106/2"). */
  paginationLinks: string[]
  /** Product card availability texts by product path (listing shows it too). */
  warnings: string[]
}

export function extractCategory(html: string, pageUrl: string): ExtractedCategory {
  const $ = loadHtml(html)
  const legacyUrl = legacyPath($, pageUrl).replace(/\/\d+$/, '')
  const oldId = Number(/-(\d+)(?:\/\d+)?$/.exec(legacyUrl)?.[1])
  const productLinks = new Set<string>()
  $('#boxPl .plWrap a[href]').each((_, a) => {
    const url = normalizeUrl($(a).attr('href'), pageUrl)
    if (url && /-detail-\d+/.test(url)) productLinks.add(toPathAndQuery(url))
  })
  const paginationLinks = new Set<string>()
  $('ul.cspager a[href]').each((_, a) => {
    const url = normalizeUrl($(a).attr('href'), pageUrl)
    if (url) paginationLinks.add(toPathAndQuery(url))
  })
  const descriptionHtml = $('.categoryDescription').first().html() ?? ''
  const title = cleanText($('h1').first().text())
  return {
    oldId,
    legacyUrl,
    title,
    intro: htmlToLexical(descriptionHtml, { pageUrl, defaultAlt: title }),
    seo: seoFromPage($),
    productLinks: [...productLinks],
    paginationLinks: [...paginationLinks],
    warnings: [],
  }
}

export interface MenuNode {
  title: string
  legacyUrl: string
  oldId: number
  /** Small menu icon of the category (the only category picture on the old site). */
  iconUrl?: string
  /** EasyWeb object id (plc:…) – used to request a larger version of the picture. */
  objectId?: string
  order: number
  children: MenuNode[]
}

/** Category tree from the left menu (`.leftSelect`) of a category page. */
export function extractMenuTree(html: string, pageUrl: string): MenuNode[] {
  const $ = loadHtml(html)
  const walk = (ul: ReturnType<typeof $>): MenuNode[] => {
    const out: MenuNode[] = []
    ul.children('li').each((i, li) => {
      const a = $(li).children('a').first()
      const url = normalizeUrl(a.attr('href'), pageUrl)
      if (!url) return
      const path = toPathAndQuery(url)
      const icon = absoluteImageUrl(a.find('img').attr('src'), pageUrl) ?? undefined
      const objectId = /ObjectIdentifier=(plc:[0-9a-f-]+)/i.exec(icon ?? '')?.[1]
      const sub = $(li).children('.submenu').children('ul').first()
      out.push({
        title: cleanText(a.find('strong').first().text() || a.text()),
        legacyUrl: path,
        oldId: Number(/-(\d+)$/.exec(path)?.[1]),
        iconUrl: icon,
        objectId,
        order: i,
        children: sub.length ? walk(sub) : [],
      })
    })
    return out
  }
  return walk($('.leftSelect .leftSelectBox > ul').first())
}

/** Larger version of a category picture: same object, the 800 px filter used for products. */
export function categoryImageCandidates(node: Pick<MenuNode, 'iconUrl' | 'objectId'>): string[] {
  const out: string[] = []
  if (node.objectId) {
    out.push(
      `https://www.terrys.cz/ew/ew_images/image_of_object?ObjectIdentifier=${node.objectId}&Filter=042cdaac-4610-40de-a462-c4d4435cec81&ImageIndex=0`,
    )
  }
  if (node.iconUrl) out.push(node.iconUrl)
  return out
}
