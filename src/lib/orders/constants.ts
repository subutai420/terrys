/**
 * Order constants (stage 4). Collections, e-mails and the storefront import the values from here;
 * never duplicate them elsewhere. Stored values are short English codes, labels are Czech.
 */

/**
 * Kind of order. `goods` = everything sold today (meat, sauces, physical vouchers in the cart).
 * `voucher` = an electronic gift voucher on its own (STAGE 7: no shipping, no date, paid by bank
 * transfer). Nothing in the order model requires delivery data, so stage 7 only adds its flow.
 */
export const ORDER_KINDS = ['goods', 'voucher'] as const
export type OrderKind = (typeof ORDER_KINDS)[number]
export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
  goods: 'Zboží',
  voucher: 'Elektronický dárkový poukaz (etapa 7)',
}

/**
 * Order status. Stage 4 creates every order as `received`; stage 5 (weighing, Balíkobot) moves
 * it on. Delivery orders: received → weighed → shipped → delivered. Pickup orders: received →
 * weighed → ready-for-pickup → picked-up. Any → cancelled.
 */
export const ORDER_STATUSES = [
  'received',
  'weighed',
  'shipped',
  'ready-for-pickup',
  'delivered',
  'picked-up',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Přijato',
  weighed: 'Zváženo',
  shipped: 'Odesláno',
  'ready-for-pickup': 'Připraveno k odběru',
  delivered: 'Doručeno',
  'picked-up': 'Vyzvednuto',
  cancelled: 'Zrušeno',
}

/** What happened to an e-mail the order sent. */
export const EMAIL_STATUSES = ['pending', 'sent', 'outbox', 'failed', 'skipped'] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]
export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  pending: 'Čeká na odeslání',
  sent: 'Odesláno',
  outbox: 'Neodesláno – jen uloženo do složky (není nastaven Resend)',
  failed: 'CHYBA – nepodařilo se odeslat',
  skipped: 'Neodesílá se (chybí adresát)',
}

/** Result of the (optional) Foxentry address check stored on the order for staff. */
export const ADDRESS_CHECK_STATUSES = ['valid', 'corrected', 'invalid', 'skipped'] as const
export type AddressCheckStatus = (typeof ADDRESS_CHECK_STATUSES)[number]
export const ADDRESS_CHECK_LABELS: Record<AddressCheckStatus, string> = {
  valid: 'Adresa ověřena',
  corrected: 'Foxentry navrhuje opravu (viz poznámka)',
  invalid: 'Adresu se nepodařilo ověřit – zkontrolujte ji',
  skipped: 'Neověřováno',
}

/** Withdrawal ("odstoupení od smlouvy") processing state – for staff only. */
export const WITHDRAWAL_STATUSES = ['new', 'processing', 'resolved'] as const
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number]
export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  new: 'Nové',
  processing: 'Řeší se',
  resolved: 'Vyřízeno',
}

/** Limits of one order (protect the server; far above any real order). */
export const MAX_ORDER_LINES = 50
export const MAX_LINE_QUANTITY = 99

/** Static pages linked from the checkout (their old URLs = their storefront paths). */
export const TERMS_PATH = '/obchodni-podminky'
export const PRIVACY_PATH = '/informace-o-zpracovani-osobnich-udaju'
export const DELIVERY_INFO_PATH = '/doprava-a-platba'
export const WITHDRAWAL_PATH = '/odstoupeni-od-smlouvy'
export const CHECKOUT_PATH = '/objednavka'
export const THANK_YOU_PATH = '/objednavka/dekujeme'

/** Label of the order button required by § 1826a odst. 3 občanského zákoníku. */
export const ORDER_BUTTON_LABEL = 'Objednávka zavazující k platbě'
