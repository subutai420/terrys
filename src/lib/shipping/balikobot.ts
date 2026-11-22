/**
 * Balíkobot API v2 – request builder, input validation and response parsing (PURE, no HTTP).
 * The HTTP client is `src/shipping/balikobotClient.ts`; tests with recorded/handwritten fixtures
 * of the documented shapes are in `balikobot.test.ts` (fixtures in `./fixtures`).
 *
 * Sources (read 22. 11. 2026):
 * - https://api-doc.balikobot.cz/docs/APIV2 – current site: base URL https://apiv2.balikobot.cz,
 *   HTTP Basic auth (API user : API key of the "expediční místo"). The public pages of the new
 *   site only show the overview; the endpoint reference below comes from
 * - https://balikobot.docs.apiary.io (API v2 blueprint, marked "no longer updated" in favour of
 *   the site above): ADD `POST /{carrier}/add` {packages:[…]}, DROP `POST /{carrier}/drop`
 *   {package_ids}, LABELS `POST /{carrier}/labels` {package_ids}, ORDER `POST /{carrier}/order`
 *   {package_ids}, status codes, error structure {packages:[{status, errors:[{type, attribute,
 *   message}]}]}.
 * NOT VERIFIED against the real API (no credentials yet) – see CLAUDE.md, stage 9 checklist.
 */

export const BALIKOBOT_DEFAULT_URL = 'https://apiv2.balikobot.cz'

/** What the shop knows about a shipment to create (built from the order). */
export type ShipmentInput = {
  /** Order number – used as `eid` (with `-attempt` after a dropped package) and `real_order_id`. */
  orderNumber: string
  /** 1 for the first package of the order; +1 after each DROP (Balíkobot needs a unique eid). */
  attempt: number
  carrierCode: string
  serviceCode: string
  recipient: {
    name: string
    company?: string | null
    street: string
    city: string
    postcode: string
    phone: string
    email: string
  }
  /** Amount to collect on delivery (whole CZK). 0 = no cash on delivery. */
  codAmount: number
  currency: 'CZK'
  /** Invoice number → variable symbol (required with cash on delivery). */
  invoiceNumber: string | null
  /** Declared value of the parcel (whole CZK) – the final total. */
  declaredValue: number
  /** Weight of the parcel incl. packaging, grams. */
  weightGrams: number
}

export type AddPackage = Record<string, string | number | boolean>
export type AddRequest = { packages: AddPackage[] }

export function shipmentEid(orderNumber: string, attempt: number): string {
  return attempt > 1 ? `${orderNumber}-${attempt}` : orderNumber
}

/** Czech mobile/landline → "+420XXXXXXXXX" (Balíkobot asks for the prefix). Null if invalid. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '')
  const plain = digits.replace(/^\+/, '').replace(/^00/, '')
  if (/^420\d{9}$/.test(plain)) return `+${plain}`
  if (/^\d{9}$/.test(plain)) return `+420${plain}`
  if (/^421\d{9}$/.test(plain)) return `+${plain}`
  return null
}

/** Variable symbol: digits only, max 10 (Czech payment rules). */
export function variableSymbol(invoiceNumber: string | null | undefined): string | null {
  const value = (invoiceNumber ?? '').trim()
  return /^\d{1,10}$/.test(value) ? value : null
}

/**
 * Validates the input BEFORE anything is sent (real mode). Returns Czech messages (empty = ok).
 * `simulation` relaxes only the carrier configuration (service code), never the order data.
 */
export function validateShipmentInput(input: ShipmentInput, { simulation = false } = {}) {
  const errors: string[] = []
  if (!input.carrierCode.trim()) {
    errors.push('U způsobu dopravy chybí kód dopravce (Doručování → Způsoby dopravy → Balíkobot).')
  }
  if (!simulation && !input.serviceCode.trim()) {
    errors.push(
      'U způsobu dopravy chybí kód služby Balíkobot (např. u PPL číslo služby z metody SERVICES).',
    )
  }
  const r = input.recipient
  if (!r.name.trim() && !r.company?.trim()) errors.push('Chybí jméno příjemce.')
  if (!r.street.trim()) errors.push('Chybí ulice a číslo příjemce.')
  if (!r.city.trim()) errors.push('Chybí obec příjemce.')
  if (!/^\d{5}$/.test(r.postcode.replace(/\s/g, ''))) errors.push('PSČ příjemce musí mít 5 číslic.')
  if (!normalizePhone(r.phone)) errors.push('Telefon příjemce není platné české číslo.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) errors.push('E-mail příjemce není platný.')
  if (!Number.isInteger(input.codAmount) || input.codAmount < 0) {
    errors.push('Částka dobírky musí být celé číslo v Kč.')
  }
  if (input.codAmount > 0 && !variableSymbol(input.invoiceNumber)) {
    errors.push(
      input.invoiceNumber
        ? `Číslo faktury „${input.invoiceNumber}“ nelze použít jako variabilní symbol dobírky (jen číslice, nejvýše 10).`
        : 'Doplňte číslo faktury – je to variabilní symbol dobírky.',
    )
  }
  if (!(input.weightGrams > 0)) errors.push('Chybí hmotnost zásilky.')
  if (input.weightGrams > 50_000) errors.push('Zásilka je těžší než 50 kg – rozdělte ji.')
  return errors
}

/** ADD request body (one package) – field names from the PPL section of the API v2 docs. */
export function buildAddRequest(input: ShipmentInput): AddRequest {
  const r = input.recipient
  const pkg: AddPackage = {
    eid: shipmentEid(input.orderNumber, input.attempt),
    real_order_id: input.orderNumber,
    reference: input.orderNumber,
    service_type: input.serviceCode,
    rec_name: r.name,
    rec_street: r.street,
    rec_city: r.city,
    rec_zip: r.postcode.replace(/\s/g, ''),
    rec_country: 'CZ',
    rec_phone: normalizePhone(r.phone) ?? r.phone,
    rec_email: r.email,
    price: input.declaredValue,
    ins_currency: input.currency,
    weight: Math.round(input.weightGrams / 10) / 100, // kg, float
    return_track: true,
    return_full_errors: true,
  }
  if (r.company?.trim()) pkg.rec_firm = r.company.trim()
  if (input.codAmount > 0) {
    pkg.cod_price = input.codAmount
    pkg.cod_currency = input.currency
    pkg.vs = variableSymbol(input.invoiceNumber) ?? ''
  }
  return { packages: [pkg] }
}

export type CarrierError = { attribute: string | null; message: string; code: number | null }

export type AddResult =
  | {
      ok: true
      packageId: string
      trackingNumber: string
      trackingUrl: string | null
      labelUrl: string | null
    }
  | { ok: false; errors: CarrierError[] }

const STATUS_MESSAGES: Record<number, string> = {
  208: 'Zásilka s tímto ID už v Balíkobotu existuje.',
  400: 'Balíkobot data odmítl – zkontrolujte údaje.',
  401: 'Balíkobot odmítl přihlášení – zkontrolujte BALIKOBOT_API_USER a BALIKOBOT_API_KEY.',
  402: 'Vícekusovou zásilku nelze zpracovat jen zčásti.',
  403: 'Dopravce není pro tyto klíče v Balíkobotu aktivovaný.',
  404: 'Zásilka neexistuje nebo už byla zpracována.',
  405: 'Zásilka už byla předána ke svozu – nelze ji zrušit.',
  406: 'Balíkobot nedostal žádná data ke zpracování (nebo je nelze přijmout).',
  409: 'Konfigurace dopravce v Balíkobotu není vyplněná, nebo jsou údaje v rozporu.',
  413: 'Špatný formát údaje.',
  423: 'Tato funkce je dostupná jen pro ostré klíče.',
  426: 'Příliš mnoho volání – zkuste to za chvíli.',
  501: 'Dopravce zatím není v Balíkobotu implementovaný.',
  503: 'Dopravce je momentálně nedostupný – zkuste to později.',
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  rec_name: 'Jméno příjemce',
  rec_firm: 'Firma příjemce',
  rec_street: 'Ulice příjemce',
  rec_city: 'Obec příjemce',
  rec_zip: 'PSČ příjemce',
  rec_country: 'Země příjemce',
  rec_phone: 'Telefon příjemce',
  rec_email: 'E-mail příjemce',
  cod_price: 'Dobírka',
  cod_currency: 'Měna dobírky',
  vs: 'Variabilní symbol',
  service_type: 'Kód služby',
  weight: 'Hmotnost',
  price: 'Udaná cena',
  eid: 'ID zásilky',
  carrier_error: 'Chyba u dopravce',
}

export function statusMessage(status: number | null | undefined): string {
  return (
    (status && STATUS_MESSAGES[status]) || `Balíkobot vrátil neočekávaný stav ${status ?? '?'}.`
  )
}

/** "PSČ příjemce: Nepovolené PSČ příjemce." */
export function formatCarrierError(error: CarrierError): string {
  const label = error.attribute ? (ATTRIBUTE_LABELS[error.attribute] ?? error.attribute) : null
  return label ? `${label}: ${error.message}` : error.message
}

type Json = Record<string, unknown>
const asObject = (value: unknown): Json | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null
const asNumber = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const asString = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : typeof value === 'number' ? String(value) : null

function packageErrors(pkg: Json | null, fallbackStatus: number | null): CarrierError[] {
  const list = Array.isArray(pkg?.errors) ? (pkg.errors as unknown[]) : []
  const errors = list
    .map(asObject)
    .filter((e): e is Json => Boolean(e))
    .map((e) => {
      const code = asNumber(e.type)
      return {
        attribute: asString(e.attribute),
        code,
        message: asString(e.message) ?? statusMessage(code),
      }
    })
  if (errors.length) return errors
  const status = asNumber(pkg?.status) ?? fallbackStatus
  return [{ attribute: null, code: status, message: statusMessage(status) }]
}

/** Parses the ADD response (HTTP status + JSON body). */
export function parseAddResponse(httpStatus: number, body: unknown): AddResult {
  const root = asObject(body)
  if (httpStatus === 401)
    return { ok: false, errors: [{ attribute: null, code: 401, message: statusMessage(401) }] }
  if (!root) {
    return {
      ok: false,
      errors: [{ attribute: null, code: httpStatus, message: statusMessage(httpStatus) }],
    }
  }
  const pkg = asObject(Array.isArray(root.packages) ? root.packages[0] : null)
  const status = asNumber(pkg?.status) ?? asNumber(root.status)
  // 208 = this eid already exists; the returned data belong to the original package – usable.
  if (
    pkg &&
    (status === 200 || status === 208) &&
    asString(pkg.package_id) &&
    asString(pkg.carrier_id)
  ) {
    return {
      ok: true,
      packageId: asString(pkg.package_id)!,
      trackingNumber: asString(pkg.carrier_id)!,
      trackingUrl: asString(pkg.track_url),
      labelUrl: asString(pkg.label_url) ?? asString(root.labels_url),
    }
  }
  return { ok: false, errors: packageErrors(pkg, asNumber(root.status) ?? httpStatus) }
}

export type SimpleResult = { ok: true; data: Json } | { ok: false; errors: CarrierError[] }

/** DROP: {packages:[{package_id, status}], status}. 200 = dropped. */
export function parseDropResponse(httpStatus: number, body: unknown): SimpleResult {
  const root = asObject(body)
  const pkg = asObject(Array.isArray(root?.packages) ? root.packages[0] : null)
  const status = asNumber(pkg?.status) ?? asNumber(root?.status) ?? httpStatus
  if (status === 200) return { ok: true, data: root ?? {} }
  return { ok: false, errors: [{ attribute: null, code: status, message: statusMessage(status) }] }
}

/** LABELS: {labels_url, status}. */
export function parseLabelsResponse(httpStatus: number, body: unknown): SimpleResult {
  const root = asObject(body)
  const status = asNumber(root?.status) ?? httpStatus
  if (status === 200 && asString(root?.labels_url)) return { ok: true, data: root! }
  return { ok: false, errors: [{ attribute: null, code: status, message: statusMessage(status) }] }
}

/** ORDER (hand the packages over to the carrier): {order_id, handover_url, labels_url, status}. */
export function parseOrderResponse(httpStatus: number, body: unknown): SimpleResult {
  const root = asObject(body)
  const status = asNumber(root?.status) ?? httpStatus
  // 208 = these packages were already handed over – nothing left to do, treat as success.
  if ((status === 200 || status === 208) && root) return { ok: true, data: root }
  return { ok: false, errors: [{ attribute: null, code: status, message: statusMessage(status) }] }
}
