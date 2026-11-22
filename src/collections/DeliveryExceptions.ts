import type { CollectionConfig, DateFieldValidation } from 'payload'

import { editors, loggedIn } from '@/access'
import { prefillHolidaysEndpoint } from '@/delivery/holidayEndpoint'
import { toShopDate } from '@/lib/delivery/calendar'
import {
  EXCEPTION_KIND_LABELS,
  EXCEPTION_KINDS,
  EXCEPTION_SCOPE_LABELS,
  EXCEPTION_SCOPES,
} from '@/lib/delivery/constants'

import { ADMIN_GROUPS } from './adminGroups'

type ExceptionData = { scope?: string; dateFrom?: string | null } | undefined

const validateDateTo: DateFieldValidation = (value, { data }) => {
  const from = (data as ExceptionData)?.dateFrom
  if (value && from && toShopDate(value as unknown as string | Date) < toShopDate(from)) {
    return 'Konec nesmí být před začátkem.'
  }
  return true
}

const dayOnly = {
  date: { pickerAppearance: 'dayOnly' as const, displayFormat: 'd. M. yyyy' },
}

/**
 * Calendar exceptions: switching a day (or a date range) off for everything, one shipping
 * method or pickup at one place – or adding an extra open day. Switching a day off = one record.
 *
 * Czech public holidays are pre-filled as ordinary "closed" records (button above the list or
 * `pnpm seed`); they are never hard-coded, so the admin may delete or change them.
 *
 * Access: staff (obsluha) may manage exceptions as well as administrators. Exceptions are the
 * only part of the delivery setup that changes routinely (a broken van, a sick driver, a
 * holiday), the people running the shop day to day must be able to react without waiting for
 * the owner, and every change is a small, reversible record. The structural setup (methods,
 * zones, postcodes) stays admin-only.
 */
export const DeliveryExceptions: CollectionConfig = {
  slug: 'delivery-exceptions',
  labels: {
    singular: 'Výjimka v kalendáři',
    plural: 'Výjimky v kalendáři',
  },
  admin: {
    group: ADMIN_GROUPS.delivery,
    useAsTitle: 'reason',
    defaultColumns: ['dateFrom', 'dateTo', 'kind', 'scope', 'reason'],
    description:
      'Svátky, dovolená, mimořádně zavřeno (nebo otevřeno navíc). Jeden záznam vypne den nebo ' +
      'celé období – pro vše, jeden způsob dopravy nebo jedno odběrné místo.',
    components: {
      beforeListTable: ['/components/admin/HolidayPrefill#HolidayPrefill'],
    },
  },
  defaultSort: '-dateFrom',
  access: {
    read: loggedIn,
    create: editors,
    update: editors,
    delete: editors,
  },
  endpoints: [prefillHolidaysEndpoint],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'dateFrom',
          type: 'date',
          label: 'Datum (od)',
          required: true,
          index: true,
          admin: { ...dayOnly, width: '50%' },
        },
        {
          name: 'dateTo',
          type: 'date',
          label: 'Do (včetně)',
          index: true,
          validate: validateDateTo,
          admin: {
            ...dayOnly,
            width: '50%',
            description: 'Jen u období, např. dovolená 6.–19. 7. Pro jeden den nechte prázdné.',
          },
        },
      ],
    },
    {
      name: 'reason',
      type: 'text',
      label: 'Důvod',
      required: true,
      admin: { description: 'Např. „Štědrý den“ nebo „Celozávodní dovolená“.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          label: 'Typ výjimky',
          required: true,
          defaultValue: 'closed',
          options: EXCEPTION_KINDS.map((value) => ({ value, label: EXCEPTION_KIND_LABELS[value] })),
          admin: { width: '50%' },
        },
        {
          name: 'scope',
          type: 'select',
          label: 'Platí pro',
          required: true,
          defaultValue: 'all',
          options: EXCEPTION_SCOPES.map((value) => ({
            value,
            label: EXCEPTION_SCOPE_LABELS[value],
          })),
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'method',
      type: 'relationship',
      relationTo: 'shipping-methods',
      label: 'Způsob dopravy',
      admin: { condition: (data: ExceptionData) => data?.scope === 'method' },
      validate: (value: unknown, { data }: { data: unknown }) =>
        (data as ExceptionData)?.scope === 'method' && !value
          ? 'Vyberte způsob dopravy, pro který výjimka platí.'
          : true,
    },
    {
      name: 'location',
      type: 'relationship',
      relationTo: 'locations',
      label: 'Odběrné místo',
      filterOptions: { isPickupPoint: { equals: true } },
      admin: { condition: (data: ExceptionData) => data?.scope === 'location' },
      validate: (value: unknown, { data }: { data: unknown }) =>
        (data as ExceptionData)?.scope === 'location' && !value
          ? 'Vyberte odběrné místo, pro které výjimka platí.'
          : true,
    },
  ],
}
