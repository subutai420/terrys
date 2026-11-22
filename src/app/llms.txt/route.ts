import { publicText } from '@/lib/openingHours'
import { SITE_NAME } from '@/lib/site'
import { absoluteUrl, getPublicPath, LISTING_PATHS } from '@/lib/urls'
import { getAllCategories, getAllPages, getLocations, getSettings } from '@/storefront/data'

/**
 * `/llms.txt` (stage 6): a short, factual map of the site for AI assistants (llmstxt.org format:
 * H1, one-line summary, sections of links). Built only from data the shop already publishes
 * (settings, locations, categories, pages) – no invented claims. Cached with the storefront.
 */
export const revalidate = 3600

const PAGE_LINKS: { legacyUrl: string; note: string }[] = [
  { legacyUrl: '/doprava-a-platba', note: 'doprava, osobní odběr a platba' },
  { legacyUrl: '/prubeh-objednavky', note: 'jak probíhá objednávka a vážení' },
  { legacyUrl: '/obchodni-podminky', note: 'obchodní podmínky' },
  { legacyUrl: '/kontaktni-informace', note: 'kontakty' },
]

export async function GET() {
  const [settings, locations, categories, pages] = await Promise.all([
    getSettings(),
    getLocations(),
    getAllCategories(),
    getAllPages(),
  ])
  const lines: string[] = [
    `# ${SITE_NAME}`,
    '',
    '> Řeznictví a e-shop s prémiovými steaky a masem (hovězí z Argentiny, Uruguaye, USA, ' +
      'Austrálie a dalších zemí, japonské wagyu). Ceny jsou za kilogram: řezník každou ' +
      'objednávku zváží a výsledná cena se řídí skutečnou hmotností (obvykle ±15 % od odhadu). ' +
      `Doprava stojí ${settings.deliveryPrice ?? 229} Kč bez ohledu na hodnotu objednávky, ` +
      'osobní odběr je zdarma, platí se až při převzetí. Bez slev a slevových kódů.',
    '',
    '## Nákup',
    '',
    `- [Všechny produkty](${absoluteUrl(LISTING_PATHS.products)}): katalog s cenami za kg a odhadem ceny porcí`,
  ]
  for (const category of categories.filter((c) => !c.parent).slice(0, 25)) {
    lines.push(`- [${category.title}](${absoluteUrl(getPublicPath('categories', category))})`)
  }
  for (const link of PAGE_LINKS) {
    const page = pages.find((p) => p.legacyUrl === link.legacyUrl)
    if (page)
      lines.push(`- [${page.title}](${absoluteUrl(getPublicPath('pages', page))}): ${link.note}`)
  }
  lines.push(
    '',
    '## Obsah',
    '',
    `- [Recepty](${absoluteUrl(LISTING_PATHS.recipes)})`,
    `- [Magazín](${absoluteUrl(LISTING_PATHS.magazine)})`,
    `- [Terrys Academy](${absoluteUrl(LISTING_PATHS.academy)}): o masu, řezech a přípravě`,
    `- [Slovník pojmů](${absoluteUrl(LISTING_PATHS.glossary)})`,
    '',
    '## Prodejny a kontakt',
    '',
    `- [Prodejny](${absoluteUrl(LISTING_PATHS.stores)})`,
  )
  for (const location of locations) {
    const address = [publicText(location.address?.street), publicText(location.address?.city)]
      .filter(Boolean)
      .join(', ')
    lines.push(`- ${location.name}${address ? `: ${address}` : ''}`)
  }
  const phone = publicText(settings.contact?.phone)
  const email = publicText(settings.contact?.email)
  if (phone) lines.push(`- Telefon: ${phone}`)
  if (email) lines.push(`- E-mail: ${email}`)
  lines.push('')
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
