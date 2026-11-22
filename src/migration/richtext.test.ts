import { describe, expect, it } from 'vitest'

import { checkBrandRules } from './brandCheck'
import { parseArgs } from './args'
import { parseCsv, toCsv, type InventoryRow } from './inventory'
import { commonWords } from './media'
import { htmlToLexical, type LexicalNode } from './richtext'
import { classifyUrl, crawlDecision, normalizeUrl } from './urls'

const PAGE = 'https://www.terrys.cz/magazin/clanek-detail-1'
const convert = (html: string) => htmlToLexical(html, { pageUrl: PAGE, defaultAlt: 'Článek' })
const children = (html: string) => (convert(html).doc?.root.children ?? []) as LexicalNode[]

describe('htmlToLexical', () => {
  it('converts headings, paragraphs, lists, bold and links, dropping styles', () => {
    const nodes = children(
      '<h1 style="color:red">Nadpis</h1><p class="x" style="font-size:20px">Text <strong>tučně</strong> a ' +
        '<a href="https://www.terrys.cz/produkty/rib-eye-106" style="color:blue">odkaz</a>.</p>' +
        '<ul><li>jedna</li><li>dva<ol><li>vnořená</li></ol></li></ul><h3>Menší</h3>',
    )
    expect(nodes.map((n) => n.type)).toEqual(['heading', 'paragraph', 'list', 'heading'])
    expect(nodes[0].tag).toBe('h2') // h1 is the page title, so content headings start at h2
    expect(nodes[3].tag).toBe('h3')
    const p = nodes[1].children as LexicalNode[]
    expect(p.map((n) => [n.type, n.text ?? '', n.format ?? ''])).toEqual([
      ['text', 'Text ', 0],
      ['text', 'tučně', 1],
      ['text', ' a ', 0],
      ['link', '', ''],
      ['text', '.', 0],
    ])
    // Internal links become legacy paths (redirected later), not absolute URLs.
    expect((p[3].fields as { url: string }).url).toBe('/produkty/rib-eye-106')
    const list = nodes[2]
    expect(list.listType).toBe('bullet')
    const items = list.children as LexicalNode[]
    expect(items).toHaveLength(3)
    expect(((items[2].children as LexicalNode[])[0] as LexicalNode).listType).toBe('number')
    expect(JSON.stringify(nodes)).not.toMatch(/color|font-size|class/)
  })

  it('keeps line breaks, drops empty paragraphs and javascript links', () => {
    const nodes = children('<p>- první<br/>- druhý<br /></p><p>&nbsp;</p><p><a href="javascript:void(0)">jen text</a></p>')
    expect(nodes).toHaveLength(2)
    expect((nodes[0].children as LexicalNode[]).map((n) => n.type)).toEqual(['text', 'linebreak', 'text'])
    expect((nodes[1].children as LexicalNode[])[0]).toMatchObject({ type: 'text', text: 'jen text' })
  })

  it('turns images into upload placeholders with a Czech alt text', () => {
    const r = convert('<p>Úvod <img src="/ew/ew_images/image?EwImage=abc&amp;Filter=f" alt="Image 2"></p>')
    const nodes = r.doc?.root.children as LexicalNode[]
    expect(nodes.map((n) => n.type)).toEqual(['paragraph', 'upload'])
    expect(r.images).toEqual([{ src: 'https://www.terrys.cz/ew/ew_images/image?EwImage=abc&Filter=f', alt: 'Článek' }])
  })

  it('reports external links, embeds, tables and struck-through prices', () => {
    const r = convert(
      '<p><a href="https://www.facebook.com/terryssteaky">FB</a></p>' +
        '<iframe src="//www.youtube.com/embed/xyz"></iframe>' +
        '<table><tr><th>Řez</th><td>Cena</td></tr></table><p><s>990 Kč</s> 890 Kč</p>',
    )
    expect(r.externalLinks).toEqual(['https://www.facebook.com/terryssteaky'])
    expect(r.embeds).toEqual(['https://www.youtube.com/embed/xyz'])
    expect(r.warnings[0]).toContain('tabulka')
    expect(r.struckText).toEqual(['990 Kč'])
    expect(r.text).toContain('Řez | Cena')
  })

  it('is deterministic (same HTML → same JSON, so re-imports see no change)', () => {
    const html = '<p><a href="/produkty">a</a></p><img src="/ew/x.jpg">'
    expect(JSON.stringify(convert(html).doc)).toBe(JSON.stringify(convert(html).doc))
  })

  it('returns null for empty HTML', () => {
    expect(convert('  <p> </p> ').doc).toBeNull()
  })
})

describe('old-site URLs', () => {
  it('normalises internal links and rejects other domains', () => {
    expect(normalizeUrl('/produkty/x-1#top', PAGE)).toBe('https://www.terrys.cz/produkty/x-1')
    expect(normalizeUrl('http://terrys.cz/magazin')).toBe('https://www.terrys.cz/magazin')
    expect(normalizeUrl('https://terrys.live/')).toBeNull()
    expect(normalizeUrl('mailto:info@example.com')).toBeNull()
  })

  it('classifies page types by URL', () => {
    expect(classifyUrl('https://www.terrys.cz/produkty/argentinsky-hovezi-rib-eye-detail-406')).toMatchObject({ type: 'product', oldId: 406 })
    expect(classifyUrl('https://www.terrys.cz/produkty/vysoky-rostenec-rib-eye-106')).toMatchObject({ type: 'category', oldId: 106 })
    expect(classifyUrl('https://www.terrys.cz/produkty/vysoky-rostenec-rib-eye-106/2')).toMatchObject({ type: 'category-page', pageNumber: 2 })
    expect(classifyUrl('https://www.terrys.cz/magazin/jak-na-steak-detail-857').type).toBe('article')
    expect(classifyUrl('https://www.terrys.cz/recepty/burger-detail-762').type).toBe('recipe')
    expect(classifyUrl('https://www.terrys.cz/pojmy/rib-eye-detail-775').type).toBe('glossary-term')
    expect(classifyUrl('https://www.terrys.cz/doprava-a-platba').type).toBe('static')
    expect(classifyUrl('https://www.terrys.cz/vyhledavani?ProductsSearch=rib').type).toBe('search')
  })

  it('never crawls the cart, account, search or filter variants', () => {
    expect(crawlDecision('https://www.terrys.cz/obchod/kosik').crawl).toBe(false)
    expect(crawlDecision('https://www.terrys.cz/vyhledavani?ProductsSearch=a').reason).toBe('search')
    expect(crawlDecision('https://www.terrys.cz/produkty/wagyu-98?druh_masa=svickova').reason).toBe('query')
    expect(crawlDecision('https://www.terrys.cz/produkty?Page=2').crawl).toBe(true)
    expect(crawlDecision('https://www.terrys.cz/prubeh-objednavky').crawl).toBe(true)
  })
})

describe('helpers', () => {
  it('round-trips the inventory CSV with quotes and commas', () => {
    const row: InventoryRow = {
      old_url: '/a?x=1',
      type: 'product',
      http_status: '200',
      title: 'Steak, "nejlepší"',
      canonical: '/a',
      redirect_to: '',
      new_collection: 'products',
      new_slug: 'a',
      note: 'řádek\ndva',
    }
    expect(parseCsv(toCsv([row]))).toEqual([row])
  })

  it('flags discounts, free shipping, crossed-out prices and the old brand name', () => {
    const rules = checkBrandRules('Akce -50 %! Doprava zdarma nad 2000 Kč. Výrobky SelaVita.', ['990 Kč']).map((h) => h.rule)
    expect(rules).toEqual(expect.arrayContaining(['sleva', 'doprava-zdarma', 'stary-nazev', 'preskrtnuta-cena']))
    expect(checkBrandRules('Cena dopravného 229 Kč nezávisle na hodnotě objednávky.')).toEqual([])
  })

  it('finds the common words of shared photo alt texts', () => {
    expect(commonWords(['Argentinský hovězí Chuck Tender', 'Irský hovězí Chuck Tender'])).toBe('Hovězí Chuck Tender')
    expect(commonWords(['Jelito', 'Jitrnice'])).toBeUndefined()
  })

  it('parses CLI options', () => {
    const a = parseArgs(['--dry-run', '--only=products,articles', '--limit', '5'])
    expect(a.flag('dry-run')).toBe(true)
    expect(a.string('only')).toBe('products,articles')
    expect(a.number('limit')).toBe(5)
    expect(a.flag('force')).toBe(false)
  })
})
