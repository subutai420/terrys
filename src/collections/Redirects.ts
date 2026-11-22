import type {
  CollectionBeforeValidateHook,
  CollectionConfig,
  PayloadRequest,
  Validate,
} from 'payload'

import { editors } from '@/access'
import {
  legacyIndex,
  type LegacyIndex,
  normalizeRedirectSource,
  normalizeRedirectTarget,
  validateRedirect,
} from '@/lib/redirects/legacy'
import { buildLegacyIndexData } from '@/redirects/legacyIndex'
import { storefrontRevalidationHooks } from '@/storefront/revalidate'

import { ADMIN_GROUPS } from './adminGroups'

/**
 * Redirects the owner adds by hand (stage 8b), e.g. "old product X → category Y" after hiding a
 * product, or an old address found in Google Search Console. No deploy needed: `src/proxy.ts`
 * reads them (through `GET /api/legacy-redirects/index`, refreshed within a minute) and so does
 * the storefront's not-found fallback (immediately).
 *
 * Most old addresses need no record here – the automatic rules in `src/lib/redirects/legacy.ts`
 * handle aliases, old IDs, hidden products and rubrics. A record here wins over those rules, but
 * never over a page that exists. To keep every redirect a single hop, saving checks:
 * - the old address is not a published page (it would never apply),
 * - the target is a published page (so a redirect never points at another redirect – no chains,
 *   no loops); if the target later disappears, the site follows it to its new place itself.
 *
 * Access: admin + staff (editors). Butchers and the public cannot read the list (the public only
 * sees the resulting 308 responses).
 */

const ownHosts = (): string[] => {
  try {
    return process.env.NEXT_PUBLIC_SERVER_URL
      ? [new URL(process.env.NEXT_PUBLIC_SERVER_URL).host]
      : []
  } catch {
    return []
  }
}

/** One fresh table per save (cached on the request: both field validations use it). */
async function indexFor(req: PayloadRequest): Promise<LegacyIndex> {
  const key = 'legacyRedirectIndex'
  if (!req.context[key]) req.context[key] = legacyIndex(await buildLegacyIndexData(req.payload))
  return req.context[key] as LegacyIndex
}

/** Store the normalised forms (lower-case path without slash at the end, own URL → path). */
const normalize: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data
  const from = normalizeRedirectSource(data.from)
  if ('path' in from) data.from = from.path
  const to = normalizeRedirectTarget(data.to, ownHosts())
  if ('target' in to) data.to = to.target
  return data
}

type RedirectData = { from?: string; to?: string; active?: boolean }

const validateFrom: Validate<string> = async (value, { data, req, id }) => {
  const from = normalizeRedirectSource(value)
  if ('error' in from) return from.error
  const duplicate = await req.payload.find({
    collection: 'redirects',
    where: { and: [{ from: { equals: from.path } }, ...(id ? [{ id: { not_equals: id } }] : [])] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (duplicate.docs.length) return 'Pro tuto starou adresu už přesměrování existuje – upravte to.'
  const { to, active } = (data ?? {}) as RedirectData
  if (active === false || !to) return true
  const target = normalizeRedirectTarget(to, ownHosts())
  if ('error' in target) return true // reported on the target field
  const problem = validateRedirect(from.path, target.target, await indexFor(req))
  return problem?.field === 'from' ? problem.message : true
}

const validateTo: Validate<string> = async (value, { data, req }) => {
  const target = normalizeRedirectTarget(value, ownHosts())
  if ('error' in target) return target.error
  const { from, active } = (data ?? {}) as RedirectData
  if (active === false) return true
  const source = normalizeRedirectSource(from)
  if ('error' in source) return true // reported on the source field
  const problem = validateRedirect(source.path, target.target, await indexFor(req))
  return problem?.field === 'to' ? problem.message : true
}

export const Redirects: CollectionConfig = {
  slug: 'redirects',
  labels: {
    singular: 'Přesměrování',
    plural: 'Přesměrování',
  },
  admin: {
    group: ADMIN_GROUPS.settings,
    useAsTitle: 'from',
    defaultColumns: ['from', 'to', 'active', 'updatedAt'],
    description:
      'Staré adresy, které mají vést jinam (trvalé přesměrování 308). Běžné staré adresy web ' +
      'přesměrovává sám – sem patří jen výjimky, např. skrytý produkt → jiná kategorie. Projeví se ' +
      'do minuty, bez nasazení nové verze.',
  },
  defaultSort: 'from',
  access: {
    read: editors,
    create: editors,
    update: editors,
    delete: editors,
  },
  hooks: {
    beforeValidate: [normalize],
    ...storefrontRevalidationHooks,
  },
  fields: [
    {
      name: 'from',
      type: 'text',
      label: 'Stará adresa',
      required: true,
      unique: true,
      index: true,
      validate: validateFrom,
      admin: {
        placeholder: '/produkty/stary-produkt-detail-123',
        description:
          'Cesta na webu (část adresy za doménou), bez otazníku. Lze vložit i celou starou adresu ' +
          'https://www.terrys.cz/… – uloží se jen cesta, malými písmeny.',
      },
    },
    {
      name: 'to',
      type: 'text',
      label: 'Nová adresa (cíl)',
      required: true,
      validate: validateTo,
      admin: {
        placeholder: '/produkty/wagyu-98',
        description:
          'Zveřejněná stránka tohoto webu, např. /produkty/wagyu-98 nebo /produkty?druh=hovezi. ' +
          'Parametry utm_… z původního odkazu se přenesou automaticky.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      label: 'Aktivní',
      defaultValue: true,
      admin: { description: 'Vypnuté přesměrování se neuplatní (zůstane pro pozdější použití).' },
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Poznámka',
      admin: { description: 'Proč přesměrování existuje (jen pro vás, na webu se nezobrazí).' },
    },
  ],
}
