import Image from 'next/image'
import Link from 'next/link'

import { publicText, weeklyRows } from '@/lib/openingHours'
import { WITHDRAWAL_PATH } from '@/lib/orders/constants'
import { SITE_NAME } from '@/lib/site'
import { getPublicPath, LISTING_PATHS } from '@/lib/urls'
import { getAllPages, getLocations, getSettings } from '@/storefront/data'

import { NewsletterForm } from './NewsletterForm'

/** Static pages in the "Nákup" column, by their old URL (only published ones are shown). */
const SHOPPING_PAGES = [
  '/doprava-a-platba',
  '/prubeh-objednavky',
  '/obchodni-podminky',
  '/informace-o-zpracovani-osobnich-udaju',
  '/pages/cookies/info.aspx',
]
/** Static pages in the "Terrys" column. */
const ABOUT_PAGES = ['/tym', '/videa', '/kontaktni-informace']

const SOCIAL_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
} as const

/**
 * Opening hours as entered in the admin, consecutive days with the same hours grouped
 * ("Pondělí–Pátek: 9:30–17:30"). Nothing when no day is filled in (we never guess hours).
 * "Dnes otevřeno" is shown only on the store pages, which are rendered per request.
 */
function hoursLines(hours: Parameters<typeof weeklyRows>[0]): string[] {
  const rows = weeklyRows(hours)
  if (rows.length === 0) return []
  // Group consecutive days with the same text: "Pondělí–Pátek 9:30–17:30".
  const groups: { from: string; to: string; text: string }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.text === row.text) last.to = row.label
    else groups.push({ from: row.label, to: row.label, text: row.text })
  }
  return groups
    .filter((group) => group.text !== 'Zavřeno')
    .map(
      (group) =>
        `${group.from === group.to ? group.from : `${group.from}–${group.to}`}: ${group.text}`,
    )
}

export async function Footer() {
  const [settings, locations, pages] = await Promise.all([
    getSettings(),
    getLocations(),
    getAllPages(),
  ])
  const pageLink = (legacyUrl: string) => {
    const page = pages.find((p) => p.legacyUrl === legacyUrl)
    return page ? { title: page.title, href: getPublicPath('pages', page) } : null
  }
  const shopping = SHOPPING_PAGES.map(pageLink).filter((l): l is NonNullable<typeof l> =>
    Boolean(l),
  )
  const about = [
    { title: 'Magazín', href: LISTING_PATHS.magazine },
    { title: 'Terrys Academy', href: LISTING_PATHS.academy },
    { title: 'Slovník pojmů', href: LISTING_PATHS.glossary },
    { title: 'Recepty', href: LISTING_PATHS.recipes },
    ...ABOUT_PAGES.map(pageLink).filter((l): l is NonNullable<typeof l> => Boolean(l)),
  ]
  const email = publicText(settings.contact?.email)
  const phone = publicText(settings.contact?.phone)
  const company = settings.company
  const companyName = publicText(company?.name)
  const ico = publicText(company?.ico)
  const social = (Object.keys(SOCIAL_LABELS) as (keyof typeof SOCIAL_LABELS)[])
    .map((key) => ({
      key,
      label: SOCIAL_LABELS[key],
      url: publicText(settings.social?.[key]) ?? '',
    }))
    .filter((item) => /^https?:\/\//.test(item.url))

  return (
    <footer>
      <NewsletterForm />
      <div className="bg-night py-12 text-[0.9375rem] text-on-dark-muted">
        <div className="wrap grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr]">
          <div className="min-w-0">
            <Link href="/" aria-label="Terrys – úvodní stránka" className="inline-block">
              <Image
                src="/img/logo-white.svg"
                alt="Terrys Steak"
                width={160}
                height={57}
                unoptimized
                className="mb-3 h-auto w-40"
              />
            </Link>
            <p>Prémiové steaky z celého světa a wagyu. Řeznictví a prodejna na Vinohradech.</p>
            {social.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
                {social.map((item) => (
                  <li key={item.key}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-white hover:underline"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="min-w-0">
            <h2 className="mb-3 text-[1.0625rem] font-semibold text-white">Nákup</h2>
            <ul className="space-y-1.5">
              {shopping.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-white hover:underline">
                    {link.title}
                  </Link>
                </li>
              ))}
              <li>
                {/* Stage 4: online withdrawal function, reachable from every page. */}
                <Link
                  href={WITHDRAWAL_PATH}
                  className="hover:text-white hover:underline"
                  data-testid="footer-withdrawal"
                >
                  Odstoupení od smlouvy
                </Link>
              </li>
              <li>
                <Link href={LISTING_PATHS.products} className="hover:text-white hover:underline">
                  Všechny produkty
                </Link>
              </li>
            </ul>
          </div>
          <div className="min-w-0">
            <h2 className="mb-3 text-[1.0625rem] font-semibold text-white">Terrys</h2>
            <ul className="space-y-1.5">
              {about.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-white hover:underline">
                    {link.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <h2 className="mb-3 text-[1.0625rem] font-semibold text-white">Prodejny a výdej</h2>
            <ul className="space-y-4">
              {locations.map((location) => {
                const street = publicText(location.address?.street)
                const city = publicText(location.address?.city)
                const lines = hoursLines(location.openingHours)
                const page =
                  typeof location.page === 'object' && location.page ? location.page : null
                return (
                  <li key={location.id}>
                    <Link
                      href={page ? getPublicPath('pages', page) : LISTING_PATHS.stores}
                      className="font-semibold text-white hover:underline"
                    >
                      {location.name}
                    </Link>
                    {street || city ? <div>{[street, city].filter(Boolean).join(', ')}</div> : null}
                    {lines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </li>
                )
              })}
              {phone || email ? (
                <li>
                  {phone ? (
                    <div>
                      <a
                        href={`tel:${phone.replace(/\s+/g, '')}`}
                        className="hover:text-white hover:underline"
                      >
                        {phone}
                      </a>
                    </div>
                  ) : null}
                  {email ? (
                    <div>
                      <a href={`mailto:${email}`} className="hover:text-white hover:underline">
                        {email}
                      </a>
                    </div>
                  ) : null}
                </li>
              ) : null}
            </ul>
          </div>
          <p className="border-t border-[#3d2a1e] pt-5 text-[0.8125rem] sm:col-span-2 lg:col-span-4">
            © {companyName ?? SITE_NAME}
            {ico ? `, IČO ${ico}` : ''}. Ceny jsou orientační, řezník každou objednávku váží a
            výsledná cena se řídí skutečnou hmotností.
          </p>
        </div>
      </div>
    </footer>
  )
}
