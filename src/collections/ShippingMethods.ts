import type { CollectionConfig } from 'payload'

import { adminOnly, loggedIn } from '@/access'
import { sortOrderField } from '@/fields/common'
import { validateTimeOfDay, weekdaysField } from '@/fields/delivery'
import { slugField } from '@/fields/slug'
import {
  COVERAGE_LABELS,
  COVERAGE_MODES,
  DEFAULT_WEEKDAYS,
  SHIPPING_METHOD_TYPE_LABELS,
  SHIPPING_METHOD_TYPES,
} from '@/lib/delivery/constants'

import { ADMIN_GROUPS } from './adminGroups'

type MethodData = { type?: string } | undefined

/**
 * Shipping methods: own refrigerated van, courier (Balíkobot/PPL) and personal pickups.
 *
 * Price is deliberately NOT a field here: every delivery method costs the single flat price from
 * Nastavení obchodu → `deliveryPrice` (229 Kč, business rule 2: no free shipping), pickup is
 * always free. That keeps one source of truth for the delivery price.
 *
 * Read: logged-in admin users only (carrier codes are internal). The storefront gets a curated
 * public view through `GET /api/delivery/options`. Writes: administrators.
 */
export const ShippingMethods: CollectionConfig = {
  slug: 'shipping-methods',
  labels: {
    singular: 'Způsob dopravy',
    plural: 'Způsoby dopravy',
  },
  admin: {
    group: ADMIN_GROUPS.delivery,
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'weekdays', 'cutoffTime', 'active', 'sortOrder'],
    description:
      'Rozvoz, kurýr a osobní odběry. Cena rozvozu i kurýra je jednotná a nastavuje se v ' +
      'Nastavení obchodu (doprava zdarma neexistuje); osobní odběr je vždy zdarma. ' +
      'Upravuje administrátor.',
  },
  defaultSort: ['sortOrder', 'name'],
  access: {
    read: loggedIn,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          label: 'Název pro zákazníka',
          required: true,
          admin: { width: '60%', description: 'Např. „Rozvoz chladicím vozem Terrys“.' },
        },
        {
          name: 'type',
          type: 'select',
          label: 'Typ',
          required: true,
          options: SHIPPING_METHOD_TYPES.map((value) => ({
            value,
            label: SHIPPING_METHOD_TYPE_LABELS[value],
          })),
          admin: { width: '40%' },
        },
      ],
    },
    {
      name: 'customerNote',
      type: 'text',
      label: 'Krátký popis pro zákazníka',
      admin: { description: 'Nepovinné, např. „Doručujeme mezi 9 a 17 hodinou.“' },
    },
    weekdaysField({
      required: true,
      defaultValue: DEFAULT_WEEKDAYS,
      admin: {
        description:
          'Ve které dny tímto způsobem doručujeme / vydáváme. Rozvozová oblast může mít vlastní ' +
          'dny. Svátky a dovolené se nevypínají tady, ale ve „Výjimkách v kalendáři“.',
      },
    }),
    {
      type: 'row',
      fields: [
        {
          name: 'cutoffTime',
          type: 'text',
          label: 'Uzávěrka objednávek (čas)',
          required: true,
          defaultValue: '12:00',
          validate: validateTimeOfDay,
          admin: {
            width: '50%',
            placeholder: '12:00',
            description:
              'Kdo objedná před tímto časem (pražský čas), může dostat nejbližší možný den. ' +
              'Objednávka přesně v tento čas nebo později se posouvá o den.',
          },
        },
        {
          name: 'leadDays',
          type: 'number',
          label: 'Příprava (dní)',
          required: true,
          defaultValue: 1,
          min: 0,
          max: 14,
          admin: {
            width: '50%',
            step: 1,
            description:
              'Kolik dní po dni objednávky je nejdříve možné doručit (při objednání před ' +
              'uzávěrkou). 1 = nejdříve zítra, 0 = ještě dnes.',
          },
        },
      ],
    },
    {
      name: 'coverage',
      type: 'select',
      label: 'Kam se doručuje',
      required: true,
      defaultValue: 'zones',
      options: COVERAGE_MODES.map((value) => ({ value, label: COVERAGE_LABELS[value] })),
      admin: {
        condition: (data: MethodData) => data?.type !== 'pickup',
        description:
          'Rozvozové oblasti (Doručování → Rozvozové oblasti) určují PSČ a případně vlastní ' +
          'dny. „Záložní“ = všude, kam nejezdí jiný rozvoz (typicky kurýr mimo oblasti ' +
          'vlastního rozvozu).',
      },
    },
    {
      name: 'location',
      type: 'relationship',
      relationTo: 'locations',
      label: 'Odběrné místo',
      filterOptions: { isPickupPoint: { equals: true } },
      admin: {
        condition: (data: MethodData) => data?.type === 'pickup',
        description: 'Provozovna, kde si zákazník objednávku vyzvedne.',
      },
      validate: (value: unknown, { data }: { data: unknown }) => {
        if ((data as MethodData)?.type === 'pickup' && !value) {
          return 'U osobního odběru vyberte odběrné místo.'
        }
        return true
      },
    },
    {
      name: 'balikobot',
      type: 'group',
      label: 'Balíkobot (kurýr)',
      admin: {
        condition: (data: MethodData) => data?.type === 'courier',
        description: 'Kódy pro napojení na Balíkobot (etapa 5). Zatím jen pro evidenci, nepovinné.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'carrierCode',
              type: 'text',
              label: 'Kód dopravce',
              admin: { width: '50%', placeholder: 'ppl' },
            },
            {
              name: 'serviceCode',
              type: 'text',
              label: 'Kód služby',
              admin: { width: '50%' },
            },
          ],
        },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      label: 'Aktivní (nabízet v košíku)',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'internalNote',
      type: 'textarea',
      label: 'Interní poznámka',
      admin: {
        position: 'sidebar',
        description: 'Zákazník ji nevidí. Např. co je potřeba ověřit.',
      },
    },
    slugField({ from: 'name' }),
    sortOrderField(),
  ],
}
