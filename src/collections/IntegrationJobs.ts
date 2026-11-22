import type { CollectionConfig } from 'payload'

import { adminOnly, editors, nobody } from '@/access'
import { ADMIN_GROUPS } from '@/collections/adminGroups'

/**
 * Stage 6: outbox of server-to-server marketing calls (`src/integrations`). One row per call:
 * Meta Conversions API `Purchase`, Heureka "Ověřeno zákazníky", Ecomail subscribe.
 *
 * Why a table: the shop runs on serverless functions. The call is made right after the response
 * (`after()`), and when it fails (network, 5xx, rate limit) the row stays `failed` with
 * `nextAttemptAt`; the cron endpoint `GET /api/integrations/retry` picks due rows up again
 * (backoff 1 min → 5 min → 30 min → 2 h → 12 h, at most 6 attempts). Ordering never waits for,
 * nor fails because of, any of these calls. The summary per order is on the order itself
 * (group "Marketing a měření").
 *
 * Personal data: `payload` holds what is sent (hashed for Meta; e-mail for Heureka/Ecomail).
 * IP address and user agent are removed from it after a successful Meta send.
 */

export const INTEGRATION_KINDS = [
  'meta-capi-purchase',
  'heureka-order',
  'ecomail-subscribe',
] as const
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number]

export const INTEGRATION_KIND_LABELS: Record<IntegrationKind, string> = {
  'meta-capi-purchase': 'Meta Conversions API – nákup',
  'heureka-order': 'Heureka Ověřeno zákazníky',
  'ecomail-subscribe': 'Ecomail – přihlášení k newsletteru',
}

export const JOB_STATUSES = [
  'pending',
  'processing',
  'sent',
  'failed',
  'skipped',
  'expired',
] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Čeká',
  processing: 'Odesílá se',
  sent: 'Odesláno',
  failed: 'Chyba – zkusí se znovu',
  skipped: 'Přeskočeno',
  expired: 'Vzdáno (příliš staré / mnoho pokusů)',
}

export const IntegrationJobs: CollectionConfig = {
  slug: 'integration-jobs',
  labels: { singular: 'Odeslání do marketingu', plural: 'Fronta marketingu' },
  admin: {
    group: ADMIN_GROUPS.settings,
    useAsTitle: 'kind',
    defaultColumns: ['createdAt', 'kind', 'status', 'order', 'attempts', 'lastError'],
    description:
      'Co obchod poslal do Meta, Heureky a Ecomailu a s jakým výsledkem. Chybná odeslání se ' +
      'opakují automaticky. Ručně opakovat: změňte stav na „Čeká“ a uložte.',
  },
  defaultSort: '-createdAt',
  access: {
    read: editors,
    create: nobody,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          label: 'Kam',
          required: true,
          index: true,
          options: INTEGRATION_KINDS.map((value) => ({
            value,
            label: INTEGRATION_KIND_LABELS[value],
          })),
          admin: { readOnly: true, width: '40%' },
        },
        {
          name: 'status',
          type: 'select',
          label: 'Stav',
          required: true,
          defaultValue: 'pending',
          index: true,
          options: JOB_STATUSES.map((value) => ({ value, label: JOB_STATUS_LABELS[value] })),
          admin: { width: '30%' },
        },
        {
          name: 'attempts',
          type: 'number',
          label: 'Pokusů',
          defaultValue: 0,
          admin: { readOnly: true, width: '30%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'order',
          type: 'relationship',
          relationTo: 'orders',
          label: 'Objednávka',
          index: true,
          admin: { readOnly: true, width: '40%' },
        },
        {
          name: 'nextAttemptAt',
          type: 'date',
          label: 'Další pokus',
          index: true,
          admin: { width: '30%', date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'sentAt',
          type: 'date',
          label: 'Odesláno',
          admin: { readOnly: true, width: '30%', date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
    {
      name: 'lockedUntil',
      type: 'date',
      admin: { hidden: true },
    },
    {
      name: 'lastError',
      type: 'textarea',
      label: 'Poslední chyba',
      admin: { readOnly: true },
    },
    {
      name: 'payload',
      type: 'json',
      label: 'Odesílaná data',
      admin: { readOnly: true },
    },
    {
      name: 'response',
      type: 'json',
      label: 'Odpověď služby',
      admin: { readOnly: true },
    },
  ],
}
