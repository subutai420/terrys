import { APIError, type CollectionConfig } from 'payload'

import { adminOnly, editors } from '@/access'
import { toShopDateTime } from '@/lib/delivery/calendar'
import { formatIsoDay } from '@/lib/vouchers/balance'
import { BATCH_LETTERS } from '@/lib/vouchers/code'

import { revalidateStorefront } from '@/storefront/revalidate'

/**
 * Voucher batches ("šarže", stage 7). The batch letter is part of every voucher code
 * (`XXXX-XXXX-XX[letter]-XXX`) and all vouchers of a batch share ONE expiry date. New vouchers
 * are always issued from the ACTIVE batch – exactly one may be active (activating a batch
 * deactivates the others). Typically one batch per year ("how to open a new batch" is in README).
 *
 * The expiry can only be moved LATER once vouchers exist (it is printed on them; extending is a
 * goodwill gesture, shortening would cheat customers). The new date is copied to the vouchers.
 */
export const VoucherBatches: CollectionConfig = {
  slug: 'voucher-batches',
  labels: { singular: 'Šarže poukazů', plural: 'Šarže poukazů' },
  admin: {
    group: false, // listed in the custom nav group "Poukazy" (VouchersNavGroup)
    useAsTitle: 'title',
    defaultColumns: ['title', 'letter', 'expiresOn', 'active', 'note'],
    description:
      'Každý nový poukaz dostane písmeno a datum platnosti AKTIVNÍ šarže. Na nový rok založte ' +
      'novou šarži (nové písmeno, nové datum) a zaškrtněte „Aktivní“ – předchozí se sama vypne.',
  },
  access: {
    read: editors,
    create: editors,
    update: editors,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req, operation }) => {
        const expires = data.expiresOn ?? originalDoc?.expiresOn
        const letter = data.letter ?? originalDoc?.letter
        if (expires && letter) {
          const day = toShopDateTime(new Date(expires)).date
          data.title = `Šarže ${letter} – platnost do ${formatIsoDay(day)}`
        }
        if (operation === 'update' && originalDoc) {
          const issued = await req.payload.count({
            collection: 'vouchers',
            where: { batch: { equals: originalDoc.id } },
            overrideAccess: true,
            req,
          })
          if (issued.totalDocs > 0) {
            if (data.letter && data.letter !== originalDoc.letter) {
              throw new APIError(
                'Písmeno šarže už je na vydaných poukazech – nejde změnit. Založte novou šarži.',
                400,
                undefined,
                true,
              )
            }
            if (
              data.expiresOn &&
              new Date(data.expiresOn).getTime() < new Date(originalDoc.expiresOn).getTime()
            ) {
              throw new APIError(
                'Platnost vydaných poukazů lze jen prodloužit, ne zkrátit.',
                400,
                undefined,
                true,
              )
            }
          }
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation, context }) => {
        if (context?.skipBatchSync) return doc
        // Only one active batch.
        if (doc.active) {
          await req.payload.update({
            collection: 'voucher-batches',
            where: { and: [{ active: { equals: true } }, { id: { not_equals: doc.id } }] },
            data: { active: false },
            overrideAccess: true,
            req,
            context: { skipBatchSync: true },
          })
        }
        // A longer validity is copied to the vouchers of the batch.
        if (operation === 'update' && previousDoc && previousDoc.expiresOn !== doc.expiresOn) {
          await req.payload.update({
            collection: 'vouchers',
            where: { batch: { equals: doc.id } },
            data: { expiresOn: doc.expiresOn },
            overrideAccess: true,
            req,
            context: { voucherService: true },
          })
        }
        // The voucher product pages show the validity of the active batch.
        revalidateStorefront(req)
        return doc
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const issued = await req.payload.count({
          collection: 'vouchers',
          where: { batch: { equals: id } },
          overrideAccess: true,
          req,
        })
        if (issued.totalDocs > 0) {
          throw new APIError(
            'Šarže má vydané poukazy – nejde smazat. Stačí odškrtnout „Aktivní“.',
            400,
            undefined,
            true,
          )
        }
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', admin: { hidden: true } },
    {
      type: 'row',
      fields: [
        {
          name: 'letter',
          type: 'select',
          label: 'Písmeno šarže',
          required: true,
          unique: true,
          options: BATCH_LETTERS.split('').map((value) => ({ value, label: value })),
          admin: {
            width: '33%',
            description: 'Bude v každém kódu poukazu na 11. místě. Bez I, L, O (zaměnitelná).',
          },
        },
        {
          name: 'expiresOn',
          type: 'date',
          label: 'Platnost poukazů do',
          required: true,
          admin: {
            width: '33%',
            date: { pickerAppearance: 'dayOnly', displayFormat: 'd. M. yyyy' },
            description: 'Včetně tohoto dne. Vytiskne se na každý poukaz.',
          },
        },
        {
          name: 'active',
          type: 'checkbox',
          label: 'Aktivní (vydávat z ní nové poukazy)',
          defaultValue: false,
          index: true,
          admin: { width: '34%' },
        },
      ],
    },
    { name: 'note', type: 'textarea', label: 'Poznámka' },
    {
      name: 'vouchers',
      type: 'join',
      collection: 'vouchers',
      on: 'batch',
      label: 'Poukazy v šarži',
      admin: { defaultColumns: ['code', 'value', 'type', 'status'], allowCreate: false },
    },
  ],
}
