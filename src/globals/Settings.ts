import type { GlobalConfig } from 'payload'

import { adminOnly, anyone } from '@/access'
import { ADMIN_GROUPS } from '@/collections/adminGroups'
import { DEFAULT_HORIZON_DAYS } from '@/lib/delivery/constants'

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
