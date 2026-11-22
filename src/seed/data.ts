/**
 * Data for `pnpm seed`. Products, prices and category URLs come from the design prototype
 * (`design-eshop/data.js`, taken from terrys.cz on 22. 11. 2026). Facts that are not known
 * (phone numbers, opening hours, company IDs, shelf life, product descriptions) are deliberately
 * left empty so nobody mistakes a made-up value for a real one.
 *
 * Image file names refer to files in `src/seed/assets/`.
 */

export type SeedCodeListItem = {
  name: string
  slug: string
  image?: string
  description?: string
  alternativeName?: string
  adjective?: string
}

export const meatTypes: SeedCodeListItem[] = [
  { name: 'Hovězí', slug: 'hovezi' },
  { name: 'Wagyu', slug: 'wagyu', image: 'c-wagyu-600.webp' },
  { name: 'Telecí', slug: 'teleci', image: 'c-06-600.webp' },
  { name: 'Vepřové', slug: 'veprove', image: 'c-04-600.webp' },
  { name: 'Zvěřina', slug: 'zverina', image: 'c-05-600.webp' },
  { name: 'Drůbež', slug: 'drubez', image: 'c-08-600.webp' },
  { name: 'Jehněčí', slug: 'jehneci' },
  { name: 'Uzeniny', slug: 'uzeniny', image: 'c-07-600.webp' },
]

export const cuts: SeedCodeListItem[] = [
  {
    name: 'Rib Eye',
    slug: 'rib-eye',
    alternativeName: 'Vysoký roštěnec',
    image: 'ribeye-600.webp',
  },
  { name: 'Tomahawk', slug: 'tomahawk', alternativeName: 'Vysoký roštěnec s kostí' },
  { name: 'Svíčková', slug: 'svickova', alternativeName: 'Tenderloin', image: 'svickova-600.webp' },
  {
    name: 'Striploin',
    slug: 'striploin',
    alternativeName: 'Nízký roštěnec',
    image: 'striploin-600.webp',
  },
  { name: 'Flank & Flap', slug: 'flank-flap', alternativeName: 'Pupek', image: 'flank-600.webp' },
  { name: 'Picanha', slug: 'picanha' },
]

export const origins: SeedCodeListItem[] = [
  { name: 'Argentina', slug: 'argentina', adjective: 'Argentinské hovězí', image: 'c-01-600.webp' },
  { name: 'Uruguay', slug: 'uruguay', adjective: 'Uruguayské hovězí', image: 'c-02-600.webp' },
  {
    name: 'Brazílie',
    slug: 'brazilie',
    adjective: 'Brazilské hovězí',
    image: 'c-brazilske-600.webp',
  },
  { name: 'USA', slug: 'usa', adjective: 'Severoamerické hovězí', image: 'c-usa-600.webp' },
  {
    name: 'Austrálie',
    slug: 'australie',
    adjective: 'Australské hovězí',
    image: 'c-australie-600.webp',
  },
  { name: 'Namibie', slug: 'namibie', adjective: 'Namibijské hovězí', image: 'c-namibie-600.webp' },
  { name: 'Irsko', slug: 'irsko', adjective: 'Irské hovězí', image: 'c-irsko-600.webp' },
  { name: 'Japonsko', slug: 'japonsko' },
]

export const usages: SeedCodeListItem[] = [
  { name: 'Grilování', slug: 'grilovani' },
  { name: 'Pečení v troubě', slug: 'peceni-v-troube' },
  { name: 'Na pánev', slug: 'na-panev' },
]

const SHELF_LIFE_PLACEHOLDER = 'UKÁZKA – doplňte ověřenou trvanlivost a podmínky skladování.'

export const shelfLives: SeedCodeListItem[] = [
  { name: 'Chlazené (vakuově balené)', slug: 'chlazene', description: SHELF_LIFE_PLACEHOLDER },
  { name: 'Mražené', slug: 'mrazene', description: SHELF_LIFE_PLACEHOLDER },
]

export type SeedCategory = {
  title: string
  slug: string
  parentSlug?: string
  menuColumn?: 'meat-type' | 'cut' | 'origin' | 'standalone'
  menuOrder: number
  image?: string
  legacyUrl?: string
}

/** Category tree. Legacy URLs only where they are known from the current terrys.cz. */
export const categories: SeedCategory[] = [
  {
    title: 'Steaky',
    slug: 'steaky',
    menuColumn: 'standalone',
    menuOrder: 10,
    legacyUrl: '/produkty/steaky-od-terrys-105',
  },
  // Steaks by origin
  {
    title: 'Argentinské hovězí',
    slug: 'argentinske-hovezi',
    parentSlug: 'steaky',
    menuColumn: 'origin',
    menuOrder: 10,
    image: 'c-01-600.webp',
    legacyUrl: '/produkty/argentinske-hovezi-23',
  },
  {
    title: 'Uruguayské hovězí',
    slug: 'uruguayske-hovezi',
    parentSlug: 'steaky',
    menuColumn: 'origin',
    menuOrder: 20,
    image: 'c-02-600.webp',
    legacyUrl: '/produkty/uruguayske-hovezi-38',
  },
  {
    title: 'Brazilské hovězí',
    slug: 'brazilske-hovezi',
    parentSlug: 'steaky',
    menuColumn: 'origin',
    menuOrder: 30,
    image: 'c-brazilske-600.webp',
    legacyUrl: '/produkty/brazilske-hovezi-93',
  },
  {
    title: 'Severoamerické hovězí',
    slug: 'severoamericke-hovezi',
    parentSlug: 'steaky',
    menuColumn: 'origin',
    menuOrder: 40,
    image: 'c-usa-600.webp',
    legacyUrl: '/produkty/severoamericke-hovezi-94',
  },
  {
    title: 'Australské hovězí',
    slug: 'australske-hovezi',
    parentSlug: 'steaky',
    menuColumn: 'origin',
    menuOrder: 50,
    image: 'c-australie-600.webp',
    legacyUrl: '/produkty/australske-hovezi-96',
  },
  {
    title: 'Namibijské hovězí',
    slug: 'namibijske-hovezi',
    parentSlug: 'steaky',
    menuColumn: 'origin',
    menuOrder: 60,
    image: 'c-namibie-600.webp',
    legacyUrl: '/produkty/namibijske-hovezi-95',
  },
  {
    title: 'Irské hovězí',
    slug: 'irske-hovezi',
    parentSlug: 'steaky',
    menuColumn: 'origin',
    menuOrder: 70,
    image: 'c-irsko-600.webp',
    legacyUrl: '/produkty/irske-hovezi-97',
  },
  // Steaks by cut
  {
    title: 'Rib Eye (vysoký roštěnec)',
    slug: 'rib-eye',
    parentSlug: 'steaky',
    menuColumn: 'cut',
    menuOrder: 10,
    image: 'ribeye-600.webp',
  },
  {
    title: 'Svíčková (tenderloin)',
    slug: 'svickova',
    parentSlug: 'steaky',
    menuColumn: 'cut',
    menuOrder: 20,
    image: 'svickova-600.webp',
  },
  {
    title: 'Striploin (nízký roštěnec)',
    slug: 'striploin',
    parentSlug: 'steaky',
    menuColumn: 'cut',
    menuOrder: 30,
    image: 'striploin-600.webp',
  },
  {
    title: 'Flank & Flap',
    slug: 'flank-flap',
    parentSlug: 'steaky',
    menuColumn: 'cut',
    menuOrder: 40,
    image: 'flank-600.webp',
  },
  // By meat type
  {
    title: 'Wagyu',
    slug: 'wagyu',
    menuColumn: 'meat-type',
    menuOrder: 10,
    image: 'c-wagyu-600.webp',
    legacyUrl: '/produkty/wagyu-98',
  },
  {
    title: 'Telecí',
    slug: 'teleci',
    menuColumn: 'meat-type',
    menuOrder: 20,
    image: 'c-06-600.webp',
  },
  {
    title: 'Zvěřina',
    slug: 'zverina',
    menuColumn: 'meat-type',
    menuOrder: 30,
    image: 'c-05-600.webp',
    legacyUrl: '/produkty/zverina-29',
  },
  {
    title: 'Vepřové',
    slug: 'veprove',
    menuColumn: 'meat-type',
    menuOrder: 40,
    image: 'c-04-600.webp',
  },
  {
    title: 'Drůbež',
    slug: 'drubez',
    menuColumn: 'meat-type',
    menuOrder: 50,
    image: 'c-08-600.webp',
  },
  {
    title: 'Uzeniny',
    slug: 'uzeniny',
    menuColumn: 'meat-type',
    menuOrder: 60,
    image: 'c-07-600.webp',
  },
  // Standalone
  {
    title: 'Dárkové poukazy a krabičky',
    slug: 'darkove-poukazy-a-krabicky',
    menuColumn: 'standalone',
    menuOrder: 90,
    image: 'c-09-600.webp',
    legacyUrl: '/produkty/darkove-poukazy-a-krabicky-130',
  },
]

type SeedVariant = { label: string; kind: 'weight' | 'piece'; weightGrams: number }

/**
 * Example portion sizes. The current terrys.cz offers steaks in 250 g – 2 kg steps; the exact
 * set per product has to be confirmed by the owner.
 */
const STEAK_VARIANTS: SeedVariant[] = [
  { label: '250 g', kind: 'weight', weightGrams: 250 },
  { label: '500 g', kind: 'weight', weightGrams: 500 },
  { label: '750 g', kind: 'weight', weightGrams: 750 },
  { label: '1 kg', kind: 'weight', weightGrams: 1000 },
]
const TOMAHAWK_VARIANTS: SeedVariant[] = [
  { label: '1 kg', kind: 'weight', weightGrams: 1000 },
  { label: '1,5 kg', kind: 'weight', weightGrams: 1500 },
  { label: '2 kg', kind: 'weight', weightGrams: 2000 },
]

export type SeedProduct = {
  title: string
  /** Price per kg in CZK incl. VAT. */
  price: number
  image: string
  cutSlug: string
  originSlug: string
  meatTypeSlug: string
  categorySlugs: string[]
  availability: 'in-stock' | 'in-transit'
  marbling?: string
  variants: SeedVariant[]
}

/** The 12 Rib Eye products from the design prototype (category Vysoký roštěnec / Rib Eye). */
export const products: SeedProduct[] = [
  {
    title: 'Argentinský hovězí Rib Eye',
    price: 990,
    image: 'p5-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'argentina',
    meatTypeSlug: 'hovezi',
    categorySlugs: ['steaky', 'rib-eye', 'argentinske-hovezi'],
    availability: 'in-stock',
    variants: STEAK_VARIANTS,
  },
  {
    title: 'Uruguayský hovězí Rib Eye',
    price: 990,
    image: 'p9-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'uruguay',
    meatTypeSlug: 'hovezi',
    categorySlugs: ['steaky', 'rib-eye', 'uruguayske-hovezi'],
    availability: 'in-stock',
    variants: STEAK_VARIANTS,
  },
  {
    title: 'Namibijský hovězí Rib Eye',
    price: 890,
    image: 'p8-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'namibie',
    meatTypeSlug: 'hovezi',
    categorySlugs: ['steaky', 'rib-eye', 'namibijske-hovezi'],
    availability: 'in-stock',
    variants: STEAK_VARIANTS,
  },
  {
    title: 'Australský hovězí Rib Eye',
    price: 1890,
    image: 'p6-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'australie',
    meatTypeSlug: 'hovezi',
    categorySlugs: ['steaky', 'rib-eye', 'australske-hovezi'],
    availability: 'in-stock',
    variants: STEAK_VARIANTS,
  },
  {
    title: 'US hovězí Rib Eye PRIME quality',
    price: 1890,
    image: 'p10-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'usa',
    meatTypeSlug: 'hovezi',
    categorySlugs: ['steaky', 'rib-eye', 'severoamericke-hovezi'],
    availability: 'in-stock',
    variants: STEAK_VARIANTS,
  },
  {
    title: 'Australský hovězí Tomahawk steak',
    price: 1790,
    image: 'p7-800.webp',
    cutSlug: 'tomahawk',
    originSlug: 'australie',
    meatTypeSlug: 'hovezi',
    categorySlugs: ['steaky', 'rib-eye', 'australske-hovezi'],
    availability: 'in-stock',
    variants: TOMAHAWK_VARIANTS,
  },
  {
    title: 'Wagyu Rib Eye Austrálie BMS 6',
    price: 3890,
    image: 'p1-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'australie',
    meatTypeSlug: 'wagyu',
    categorySlugs: ['steaky', 'rib-eye', 'wagyu'],
    availability: 'in-stock',
    marbling: 'BMS 6',
    variants: STEAK_VARIANTS,
  },
  {
    title: 'Wagyu Tomahawk Austrálie BMS 8/9',
    price: 3890,
    image: 'p11-800.webp',
    cutSlug: 'tomahawk',
    originSlug: 'australie',
    meatTypeSlug: 'wagyu',
    categorySlugs: ['steaky', 'rib-eye', 'wagyu'],
    availability: 'in-stock',
    marbling: 'BMS 8/9',
    variants: TOMAHAWK_VARIANTS,
  },
  {
    title: 'Wagyu Rib Eye Austrálie BMS 8+',
    price: 5900,
    image: 'p2-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'australie',
    meatTypeSlug: 'wagyu',
    categorySlugs: ['steaky', 'rib-eye', 'wagyu'],
    availability: 'in-stock',
    marbling: 'BMS 8+',
    variants: STEAK_VARIANTS,
  },
  {
    title: 'Wagyu Rib Eye Japonsko A3',
    price: 7500,
    image: 'p4-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'japonsko',
    meatTypeSlug: 'wagyu',
    categorySlugs: ['steaky', 'rib-eye', 'wagyu'],
    availability: 'in-stock',
    marbling: 'A3',
    variants: STEAK_VARIANTS,
  },
  {
    title: 'Wagyu Rib Eye Japonsko A4',
    price: 7500,
    image: 'p3-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'japonsko',
    meatTypeSlug: 'wagyu',
    categorySlugs: ['steaky', 'rib-eye', 'wagyu'],
    availability: 'in-stock',
    marbling: 'A4',
    variants: STEAK_VARIANTS,
  },
  {
    title: 'Wagyu Rib Eye Japonsko A5+',
    price: 9990,
    image: 'p12-800.webp',
    cutSlug: 'rib-eye',
    originSlug: 'japonsko',
    meatTypeSlug: 'wagyu',
    categorySlugs: ['steaky', 'rib-eye', 'wagyu'],
    availability: 'in-transit',
    marbling: 'A5+',
    variants: STEAK_VARIANTS,
  },
]

/** Static pages created as empty drafts, so the structure is ready for the texts. */
export const pages: { title: string; slug: string; legacyUrl?: string }[] = [
  { title: 'Doprava a platba', slug: 'doprava-a-platba', legacyUrl: '/doprava-a-platba' },
  { title: 'Obchodní podmínky', slug: 'obchodni-podminky' },
  { title: 'Ochrana osobních údajů (GDPR)', slug: 'ochrana-osobnich-udaju' },
  { title: 'O nás', slug: 'o-nas' },
  { title: 'Vše o nákupu', slug: 'vse-o-nakupu' },
]

/** Placeholder marker for values the owner has to fill in. */
export const TODO = 'DOPLNIT'
