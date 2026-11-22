import type { GlobalConfig, TextFieldSingleValidation } from 'payload'

import { adminOnly, anyone } from '@/access'
import { ADMIN_GROUPS } from '@/collections/adminGroups'
import { DEFAULT_HORIZON_DAYS } from '@/lib/delivery/constants'
import { DEFAULT_WEIGHT_TOLERANCE_PERCENT } from '@/lib/orders/constants'
import {
  DEFAULT_PAYMENT_DUE_HOURS,
  OVERDUE_ACTION_LABELS,
  OVERDUE_ACTIONS,
} from '@/lib/vouchers/constants'
import { parseBankAccount } from '@/lib/vouchers/spayd'
import { revalidateGlobalAfterChange } from '@/storefront/revalidate'

/** Stage 7: empty is allowed (vouchers then cannot be bought); anything else must be valid. */
const validateBankAccount: TextFieldSingleValidation = (value) => {
  if (!value || !String(value).trim()) return true
  const parsed = parseBankAccount(String(value))
  return parsed.ok ? true : parsed.error
}

/** Default storefront notice next to estimated prices (business rule: final price by weight). */
export const DEFAULT_PRICE_NOTICE =
  'Cena je orientační. Každou objednávku řezník váží a výsledná cena se řídí skutečnou ' +
  'hmotností (obvykle se liší do ±15 %).'

/**
 * Shop-wide settings: delivery price, contacts, company identification, social links.
 * Read by anyone (the storefront shows contacts), edited only by administrators.
 */
export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Nastavení obchodu',
  admin: {
    group: ADMIN_GROUPS.settings,
    description: 'Základní údaje obchodu. Upravuje jen administrátor.',
  },
  access: {
    read: anyone,
    update: adminOnly,
  },
  // Stage 3: contacts and the delivery price are shown on every storefront page.
  hooks: {
    afterChange: [revalidateGlobalAfterChange],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Doprava a ceny',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  // The single source of truth for the delivery price: every shipping method of
                  // type own-delivery or courier costs this; pickup is always 0 (stage 2).
                  name: 'deliveryPrice',
                  type: 'number',
                  label: 'Cena dopravy (Kč)',
                  required: true,
                  defaultValue: 229,
                  // At least 1 Kč: free shipping must never exist (business rule 2).
                  min: 1,
                  admin: {
                    width: '50%',
                    description:
                      'Jednotná cena pro rozvoz vlastním vozem i kurýra, bez ohledu na hodnotu ' +
                      'objednávky. Doprava zdarma neexistuje. Osobní odběr je vždy zdarma.',
                  },
                },
                {
                  name: 'deliveryHorizonDays',
                  type: 'number',
                  label: 'Kolik dní dopředu nabízet termíny',
                  required: true,
                  defaultValue: DEFAULT_HORIZON_DAYS,
                  min: 1,
                  max: 90,
                  admin: {
                    width: '50%',
                    step: 1,
                    description: `Košík nabídne termíny doručení na tolik dní dopředu (výchozí ${DEFAULT_HORIZON_DAYS}).`,
                  },
                },
              ],
            },
            {
              name: 'priceNotice',
              type: 'textarea',
              label: 'Upozornění u odhadu ceny',
              required: true,
              defaultValue: DEFAULT_PRICE_NOTICE,
              admin: {
                description:
                  'Text, který obchod zobrazí u každé odhadované ceny. Musí vysvětlit, že ' +
                  'výsledná cena závisí na skutečné hmotnosti.',
              },
            },
          ],
        },
        {
          label: 'Objednávky',
          fields: [
            {
              name: 'orders',
              type: 'group',
              label: 'Objednávky',
              fields: [
                {
                  // Stage 4: the internal copy of every order goes here (safety net when the
                  // admin is down). Empty → env ORDER_NOTIFICATION_EMAIL → contact e-mail.
                  name: 'notificationEmail',
                  type: 'email',
                  label: 'Kam posílat kopii každé objednávky',
                  admin: {
                    description:
                      'Interní e-mail s kompletními údaji objednávky (např. objednavky@…). Když je ' +
                      'prázdné, použije se proměnná ORDER_NOTIFICATION_EMAIL, jinak kontaktní e-mail.',
                  },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      // Stage 5: weighing screen warns (and asks for a reason) above this.
                      name: 'weightTolerancePercent',
                      type: 'number',
                      label: 'Povolená odchylka při vážení (%)',
                      required: true,
                      defaultValue: DEFAULT_WEIGHT_TOLERANCE_PERCENT,
                      min: 1,
                      max: 100,
                      admin: {
                        width: '50%',
                        step: 1,
                        description:
                          'Když se skutečná hmotnost liší od odhadu víc, řezník musí napsat důvod a ' +
                          'objednávka se označí „ke kontrole“. Vážení to neblokuje.',
                      },
                    },
                    {
                      // Stage 5: added to the weighed goods for the courier parcel weight.
                      name: 'packagingWeightGrams',
                      type: 'number',
                      label: 'Hmotnost obalu zásilky (g)',
                      required: true,
                      defaultValue: 1000,
                      min: 0,
                      max: 20000,
                      admin: {
                        width: '50%',
                        step: 50,
                        description:
                          'Termobox, chladicí vložky… Přičte se k masu u zásilky kurýrem.',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          // Stage 7: gift vouchers (src/vouchers). Bank transfer only for ELECTRONIC vouchers.
          label: 'Dárkové poukazy',
          fields: [
            {
              name: 'vouchers',
              type: 'group',
              label: 'Dárkové poukazy',
              admin: {
                description:
                  'Elektronické poukazy se platí převodem předem: e-mail s poukazem a QR kódem ' +
                  'pro platbu odchází hned po objednávce. Bez vyplněného účtu nelze elektronické ' +
                  'poukazy objednat (obchod je nenabídne).',
              },
              fields: [
                {
                  name: 'bankAccount',
                  type: 'text',
                  label: 'Bankovní účet pro platby poukazů',
                  validate: validateBankAccount,
                  admin: {
                    description:
                      'Číslo účtu ve tvaru 123456789/0800 (případně s předčíslím 19-123456789/0800) ' +
                      'nebo IBAN (CZ…). Uvede se v e-mailu a v QR kódu pro platbu. Zkontroluje se ' +
                      'kontrolní součet – překlep se neuloží.',
                  },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'paymentDueHours',
                      type: 'number',
                      label: 'Splatnost (hodin od objednávky)',
                      required: true,
                      defaultValue: DEFAULT_PAYMENT_DUE_HOURS,
                      min: 1,
                      max: 24 * 30,
                      admin: { width: '33%', step: 1 },
                    },
                    {
                      name: 'overdueAction',
                      type: 'select',
                      label: 'Když poukaz není včas zaplacený',
                      required: true,
                      defaultValue: 'flag-remind',
                      options: OVERDUE_ACTIONS.map((value) => ({
                        value,
                        label: OVERDUE_ACTION_LABELS[value],
                      })),
                      admin: {
                        width: '42%',
                        description:
                          'Objednávka se vždy objeví v „Poukazy – platby“ jako po splatnosti. ' +
                          'Automatické zrušení jen když ho výslovně zvolíte.',
                      },
                    },
                    {
                      name: 'autoCancelAfterDays',
                      type: 'number',
                      label: 'Zrušit po (dnech po splatnosti)',
                      defaultValue: 14,
                      min: 1,
                      max: 365,
                      admin: {
                        width: '25%',
                        step: 1,
                        condition: (_data, sibling) =>
                          sibling?.overdueAction === 'flag-remind-cancel',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Kontakty',
          fields: [
            {
              name: 'contact',
              type: 'group',
              label: 'Kontakty',
              fields: [
                { name: 'email', type: 'email', label: 'Kontaktní e-mail' },
                { name: 'phone', type: 'text', label: 'Telefon' },
                {
                  name: 'whatsapp',
                  type: 'text',
                  label: 'WhatsApp',
                  admin: { description: 'Číslo v mezinárodním tvaru, např. +420 …' },
                },
              ],
            },
          ],
        },
        {
          label: 'Firma',
          fields: [
            {
              name: 'company',
              type: 'group',
              label: 'Identifikace firmy',
              admin: { description: 'Údaje do patičky, obchodních podmínek a na doklady.' },
              fields: [
                { name: 'name', type: 'text', label: 'Obchodní firma' },
                {
                  type: 'row',
                  fields: [
                    { name: 'ico', type: 'text', label: 'IČO', admin: { width: '50%' } },
                    { name: 'dic', type: 'text', label: 'DIČ', admin: { width: '50%' } },
                  ],
                },
                { name: 'address', type: 'textarea', label: 'Sídlo' },
                {
                  name: 'registration',
                  type: 'text',
                  label: 'Zápis v obchodním rejstříku',
                  admin: { description: 'Např. „C 12345 vedená u Městského soudu v Praze“.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Sociální sítě',
          fields: [
            {
              name: 'social',
              type: 'group',
              label: 'Sociální sítě',
              fields: [
                { name: 'facebook', type: 'text', label: 'Facebook (URL)' },
                { name: 'instagram', type: 'text', label: 'Instagram (URL)' },
                { name: 'youtube', type: 'text', label: 'YouTube (URL)' },
                { name: 'tiktok', type: 'text', label: 'TikTok (URL)' },
              ],
            },
          ],
        },
      ],
    },
  ],
}
