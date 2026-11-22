/**
 * Default texts of the homepage (global `homepage`). Used as `defaultValue` of the admin fields
 * AND as the storefront fallback when an editor leaves a field empty, so the homepage never shows
 * a hole. The copy comes from design variant A approved by the owner; edit it in the admin
 * (Obsah → Úvodní stránka), not here.
 *
 * `{doprava}` in a trust item is replaced by the delivery price from settings (e.g. "229 Kč"),
 * so the price lives in exactly one place (business rule 2: never free).
 */
export const HOMEPAGE_DEFAULTS = {
  hero: {
    heading: 'Steaky z celého světa, naporcované řezníkem',
    text:
      'Argentina, Uruguay, USA, Austrálie i japonské wagyu. Vybíráme celé kusy, porcujeme je ' +
      'u nás a vozíme vlastním chlazeným rozvozem až k vám domů.',
    primaryLabel: 'Vybrat steak',
    primaryUrl: '/produkty',
  },
  trustItems: [
    { title: 'Každou objednávku vážíme', text: 'Platíte za skutečnou hmotnost masa' },
    { title: 'Chlazený rozvoz', text: 'Doprava za {doprava} bez ohledu na hodnotu nákupu' },
    { title: 'Platíte při převzetí', text: 'Žádné placení předem přes internet' },
    { title: 'Osobní odběr', text: 'V prodejně v Italské ulici v Praze' },
  ],
  featuredCategoriesHeading: 'Naše nejoblíbenější steaky',
  featuredCategoriesSubheading: 'Řezy, které si zákazníci objednávají nejčastěji',
  originsHeading: 'Steaky ze všech koutů světa',
  otherCategoriesHeading: 'Další maso a dárky',
  featuredProductsHeading: 'Doporučujeme',
  magazineHeading: 'Z našeho magazínu',
  magazineSubheading: 'Řezy, plemena a postupy od našich řezníků',
  recipesHeading: 'Co dnes uvařit',
} as const
