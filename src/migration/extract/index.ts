import type { PageType } from '../urls'
import { extractCategory, extractMenuTree, categoryImageCandidates } from './category'
import { extractArticle, extractRecipe, extractStaticPage } from './content'
import { extractProduct } from './product'

export { extractArticle, extractRecipe, extractStaticPage } from './content'
export { extractCategory, extractMenuTree } from './category'
export { extractProduct } from './product'

/** Which Payload collection a page type is imported into (null = not imported). */
export function targetCollection(type: PageType): 'products' | 'categories' | 'articles' | 'recipes' | 'pages' | null {
  switch (type) {
    case 'product':
      return 'products'
    case 'category':
      return 'categories'
    case 'article':
    case 'academy-article':
    case 'glossary-term':
      return 'articles'
    case 'recipe':
      return 'recipes'
    case 'static':
    case 'store':
      return 'pages'
    default:
      return null
  }
}

/** Image URLs used by migrated content on a page (the crawler downloads them into the cache). */
export function collectImageUrls(type: PageType, html: string, url: string): string[] {
  const images: string[] = []
  const fromRichText = (list: { src: string }[]) => images.push(...list.map((i) => i.src))
  switch (type) {
    case 'product': {
      const p = extractProduct(html, url)
      images.push(...p.images)
      fromRichText(p.shortDescription.images)
      fromRichText(p.description.images)
      break
    }
    case 'category': {
      const c = extractCategory(html, url)
      fromRichText(c.intro.images)
      for (const node of flatten(extractMenuTree(html, url))) images.push(...categoryImageCandidates(node))
      break
    }
    case 'article':
    case 'academy-article':
    case 'glossary-term': {
      const a = extractArticle(html, url)
      if (a.coverImage) images.push(a.coverImage)
      fromRichText(a.content.images)
      break
    }
    case 'recipe': {
      const r = extractRecipe(html, url)
      if (r.coverImage) images.push(r.coverImage)
      for (const s of r.steps) if (s.image) images.push(s.image)
      fromRichText(r.content.images)
      break
    }
    case 'static':
    case 'store': {
      fromRichText(extractStaticPage(html, url).content.images)
      break
    }
    default:
      break
  }
  return [...new Set(images)]
}

function flatten<T extends { children: T[] }>(nodes: T[]): T[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)])
}
export { flatten as flattenTree }
