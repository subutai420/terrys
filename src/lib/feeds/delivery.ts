/**
 * Delivery ids of the Czech comparison sites (stage 6). Lists read 2026-11:
 * - Heureka: https://sluzby.heureka.cz/napoveda/xml-feed/ (`PPL`, `VLASTNI_PREPRAVA` = own
 *   delivery to the WHOLE Czech Republic only; no id for own pickup points),
 * - Zboží.cz: https://napoveda.sklik.cz/reklamy/xml-feed/specifikace/ (`PPL`,
 *   `VLASTNI_PREPRAVA` – whole CR only, `VLASTNI_VYDEJNI_MISTA` = own pickup points).
 *
 * Our own van serves only a few postcode zones (Prague), so it is NOT `VLASTNI_PREPRAVA` in the
 * feeds; the courier (PPL via Balíkobot) covers the whole country and is what the feeds offer.
 */

/** Balíkobot carrier code → comparison-site delivery id (courier to the address). */
const COURIER_IDS: Record<string, string> = {
  ppl: 'PPL',
  cp: 'CESKA_POSTA',
  dpd: 'DPD',
  gls: 'GLS',
  dhl: 'DHL',
  ups: 'UPS',
  zasilkovna: 'ZASILKOVNA_NA_ADRESU',
}

export function courierDeliveryId(carrierCode: string | null | undefined): string {
  return COURIER_IDS[(carrierCode ?? '').trim().toLowerCase()] ?? 'PPL'
}

/** Delivery id of an order's method (Zboží/Seznam conversion `delivery_type`). */
export function orderDeliveryId(
  methodType: string | null | undefined,
  carrierCode?: string | null,
): string | null {
  switch (methodType) {
    case 'pickup':
      return 'VLASTNI_VYDEJNI_MISTA'
    case 'courier':
      return courierDeliveryId(carrierCode)
    case 'own-delivery':
      return 'VLASTNI_PREPRAVA'
    default:
      return null
  }
}
