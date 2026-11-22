import type { Availability, PriceUnit } from './catalog'
import { AVAILABILITY_ORDER, sortablePrice } from './productView'

/**
 * Category filters, sorting and pagination (stage 3). Everything lives in URL query parameters,
 * so a filtered list can be shared and the back button works:
 *
 *   ?rez=rib-eye&puvod=argentina,uruguay&razeni=cena-vzestupne&strana=2
 *
 * Within one group the values are OR-ed, groups are AND-ed. Filtered and sorted pages are
 * `noindex,follow` with the canonical URL of the unfiltered category; plain pagination
 * (`?strana=2`) is indexable with a self-referencing canonical.
 *
 * Products are filtered in memory: a category has at most a few hundred products, and computing
 * the options with counts (only values that occur in the category) is then trivial.
 * Pure module, unit-tested in `filters.test.ts`.
 */

export const FILTER_GROUPS = [
  { key: 'druh', field: 'meatType', label: 'Druh masa' },
  { key: 'rez', field: 'cut', label: 'Řez' },
  { key: 'puvod', field: 'origin', label: 'Země původu' },
  { key: 'pouziti', field: 'usages', label: 'Hodí se na' },
] as const

export type FilterKey = (typeof FILTER_GROUPS)[number]['key'] | 'dostupnost'

export const AVAILABILITY_FILTER = [
  { value: 'skladem', label: 'Skladem', availability: 'in-stock' },
  { value: 'na-ceste', label: 'Na cestě', availability: 'in-transit' },
  { value: 'vyprodano', label: 'Vyprodáno', availability: 'sold-out' },
] as const

export const SORT_OPTIONS = [
  { value: 'doporucene', label: 'Doporučené' },
  { value: 'cena-vzestupne', label: 'Ceny od nejnižší' },
  { value: 'cena-sestupne', label: 'Ceny od nejvyšší' },
  { value: 'nazev', label: 'Názvu A–Z' },
] as const
export type SortValue = (typeof SORT_OPTIONS)[number]['value']
export const DEFAULT_SORT: SortValue = 'doporucene'

export const PAGE_SIZE = 24

/** Code list value as the filter needs it. */
export type FilterTerm = { slug?: string | null; name: string; sortOrder?: number | null }

/** A relation as Payload returns it: populated object, or a bare id when not populated. */
type Relation = FilterTerm | number | null | undefined

/** The product fields filters work with (populated relations, depth ≥ 1). */
export type FilterableProduct = {
  title: string
  price: number
  priceUnit: PriceUnit
  availability: Availability
  meatType?: Relation
  cut?: Relation
  origin?: Relation
  usages?: (FilterTerm | number)[] | null
}

export type FilterState = {
  selected: Record<FilterKey, string[]>
  sort: SortValue
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

const ALL_KEYS: FilterKey[] = [...FILTER_GROUPS.map((g) => g.key), 'dostupnost']

/** Reads the URL query (as Next.js passes `searchParams`). Unknown or broken values are ignored. */
export function parseFilterParams(params: RawParams): FilterState {
  const selected = {} as Record<FilterKey, string[]>
  for (const key of ALL_KEYS) {
    const raw = params[key]
    const values = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .flatMap((value) => value.split(','))
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-z0-9-]{1,80}$/.test(value))
    selected[key] = [...new Set(values)].sort()
  }
  const sortRaw = typeof params.razeni === 'string' ? params.razeni : undefined
  const sort = SORT_OPTIONS.some((o) => o.value === sortRaw) ? (sortRaw as SortValue) : DEFAULT_SORT
  const pageRaw = Number(typeof params.strana === 'string' ? params.strana : 1)
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 && pageRaw <= 1000 ? pageRaw : 1
  return { selected, sort, page }
}

/** True when filters or a non-default sort are active (→ noindex, canonical to the category). */
export function hasActiveFilters(state: FilterState): boolean {
  return ALL_KEYS.some((key) => state.selected[key].length > 0) || state.sort !== DEFAULT_SORT
}

function termsOf(
  product: FilterableProduct,
  field: (typeof FILTER_GROUPS)[number]['field'],
): (FilterTerm & { slug: string })[] {
  const value = product[field]
  const list = Array.isArray(value) ? value : [value]
  return list.filter(
    (term): term is FilterTerm & { slug: string } =>
      typeof term === 'object' &&
      term !== null &&
      typeof term.slug === 'string' &&
      term.slug !== '',
  )
}

function availabilitySlug(availability: Availability): string | undefined {
  return AVAILABILITY_FILTER.find((o) => o.availability === availability)?.value
}

function matchesGroup(product: FilterableProduct, key: FilterKey, values: string[]): boolean {
  if (values.length === 0) return true
  if (key === 'dostupnost') {
    const slug = availabilitySlug(product.availability)
    return slug !== undefined && values.includes(slug)
  }
  const group = FILTER_GROUPS.find((g) => g.key === key)
  if (!group) return true
  return termsOf(product, group.field).some((term) => values.includes(term.slug))
}

export function filterProducts<T extends FilterableProduct>(
  products: T[],
  state: FilterState,
): T[] {
  return products.filter((product) =>
    ALL_KEYS.every((key) => matchesGroup(product, key, state.selected[key])),
  )
}

const collator = new Intl.Collator('cs')

export function sortProducts<T extends FilterableProduct>(products: T[], sort: SortValue): T[] {
  const list = [...products]
  switch (sort) {
    case 'cena-vzestupne':
      return list.sort(
        (a, b) => sortablePrice(a) - sortablePrice(b) || collator.compare(a.title, b.title),
      )
    case 'cena-sestupne':
      return list.sort(
        (a, b) => sortablePrice(b) - sortablePrice(a) || collator.compare(a.title, b.title),
      )
    case 'nazev':
      return list.sort((a, b) => collator.compare(a.title, b.title))
    case 'doporucene':
    default:
      // Buyable first, then by name: sold-out items stay listed (SEO) but at the end.
      return list.sort(
        (a, b) =>
          AVAILABILITY_ORDER[a.availability] - AVAILABILITY_ORDER[b.availability] ||
          collator.compare(a.title, b.title),
      )
  }
}

export type FacetOption = { value: string; label: string; count: number; selected: boolean }
export type Facet = { key: FilterKey; label: string; options: FacetOption[] }

/**
 * Filter groups with the values that occur among the products (counts over all products of the
 * category, i.e. before filtering). Groups with fewer than two values are left out – a filter with
 * a single option does not help anyone – unless that value is selected.
 */
export function buildFacets(products: FilterableProduct[], state: FilterState): Facet[] {
  const facets: Facet[] = []
  for (const group of FILTER_GROUPS) {
    const counts = new Map<string, { term: FilterTerm & { slug: string }; count: number }>()
    for (const product of products) {
      for (const term of termsOf(product, group.field)) {
        const entry = counts.get(term.slug) ?? { term, count: 0 }
        entry.count++
        counts.set(term.slug, entry)
      }
    }
    const options = [...counts.values()]
      .sort(
        (a, b) =>
          (a.term.sortOrder ?? 100) - (b.term.sortOrder ?? 100) ||
          collator.compare(a.term.name, b.term.name),
      )
      .map(({ term, count }) => ({
        value: term.slug,
        label: term.name,
        count,
        selected: state.selected[group.key].includes(term.slug),
      }))
    if (options.length > 1 || options.some((o) => o.selected)) {
      facets.push({ key: group.key, label: group.label, options })
    }
  }
  const availabilityOptions = AVAILABILITY_FILTER.map((option) => ({
    value: option.value,
    label: option.label,
    count: products.filter((p) => p.availability === option.availability).length,
    selected: state.selected.dostupnost.includes(option.value),
  })).filter((option) => option.count > 0 || option.selected)
  if (availabilityOptions.length > 1 || availabilityOptions.some((o) => o.selected)) {
    facets.push({ key: 'dostupnost', label: 'Dostupnost', options: availabilityOptions })
  }
  return facets
}

export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)
  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    page: current,
    totalPages,
    totalItems: items.length,
  }
}

/**
 * Query string for a state (stable order, so equal states give equal URLs). Returns "" for the
 * default state. Page 1 is never written.
 */
export function filterQueryString(state: FilterState): string {
  // Values are validated slugs ([a-z0-9-]), so they need no encoding; commas stay readable.
  const parts: string[] = []
  for (const key of ALL_KEYS) {
    if (state.selected[key].length) parts.push(`${key}=${state.selected[key].join(',')}`)
  }
  if (state.sort !== DEFAULT_SORT) parts.push(`razeni=${state.sort}`)
  if (state.page > 1) parts.push(`strana=${state.page}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

/** State with one value toggled (and back on page 1). */
export function toggleFilter(state: FilterState, key: FilterKey, value: string): FilterState {
  const current = state.selected[key]
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value].sort()
  return { ...state, selected: { ...state.selected, [key]: next }, page: 1 }
}

export function withPage(state: FilterState, page: number): FilterState {
  return { ...state, page }
}

export function clearFilters(state: FilterState): FilterState {
  return parseFilterParams(state.sort !== DEFAULT_SORT ? { razeni: state.sort } : {})
}
