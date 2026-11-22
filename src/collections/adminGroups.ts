/**
 * Admin sidebar groups. The order of the groups in the sidebar follows the order in which the
 * collections are listed in `payload.config.ts`.
 */
export const ADMIN_GROUPS = {
  orders: 'Objednávky',
  // Stage 7: gift vouchers (custom nav group like orders, see VouchersNavGroup).
  vouchers: 'Poukazy',
  catalog: 'Katalog',
  codeLists: 'Číselníky',
  content: 'Obsah',
  delivery: 'Doručování',
  settings: 'Nastavení',
} as const
