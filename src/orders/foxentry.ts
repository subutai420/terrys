import type { AddressCheckStatus } from '@/lib/orders/constants'

/**
 * Optional address validation with Foxentry (the old terrys.cz uses Foxentry).
 *
 * Integration choice: SERVER-SIDE API calls only (the API key stays secret, no third-party script
 * in the visitor's browser). The checkout asks `POST /api/checkout/address-check` when the
 * customer leaves the address fields and offers a correction; the order placement checks again
 * and stores the result on the order for staff. Address problems NEVER block an order – the
 * delivery postcode is what decides delivery, and the driver can call the customer.
 *
 * Configuration (none of it exists yet; without `FOXENTRY_API_KEY` everything is skipped):
 * - `FOXENTRY_API_KEY` – API key of a Foxentry project with the "location" service
 *   (Foxentry admin → project → API keys). Sent as `Authorization: Bearer <key>`.
 * - `FOXENTRY_API_VERSION` – optional `Api-Version` header (default `2.0`; v2.0 is supported
 *   until 05/2027 according to Foxentry, check before switching).
 * API: `POST https://api.foxentry.com/location/validate`, docs https://foxentry.dev/
 * (request body `{ request: { query, options } }`, response `response.result.proposal` =
 * `valid` / `invalidWithCorrection` / `invalidWithSuggestion`, corrected data in
 * `response.resultCorrected.data`, alternatives in `response.suggestions`). Verify the shapes
 * with the first real key: the mapping below is defensive and falls back to "skipped".
 */

export type AddressQuery = { street: string; city: string; postcode: string }

export type AddressCheck = {
  status: AddressCheckStatus
  note: string | null
  suggestion: AddressQuery | null
}

const SKIPPED: AddressCheck = { status: 'skipped', note: null, suggestion: null }

export function foxentryEnabled(): boolean {
  return Boolean(process.env.FOXENTRY_API_KEY)
}

type FoxentryData = {
  streetWithNumber?: string
  street?: string
  number?: { full?: string }
  city?: string
  zip?: string
}

function toAddress(data: FoxentryData | undefined): AddressQuery | null {
  if (!data) return null
  const street =
    data.streetWithNumber ?? [data.street, data.number?.full].filter(Boolean).join(' ').trim()
  if (!street || !data.city || !data.zip) return null
  return { street, city: data.city, postcode: String(data.zip).replace(/\s/g, '') }
}

const same = (a: AddressQuery, b: AddressQuery) =>
  a.street.trim().toLowerCase() === b.street.trim().toLowerCase() &&
  a.city.trim().toLowerCase() === b.city.trim().toLowerCase() &&
  a.postcode === b.postcode

export async function checkAddress(
  query: AddressQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<AddressCheck> {
  const apiKey = process.env.FOXENTRY_API_KEY
  if (!apiKey) return SKIPPED
  try {
    const response = await fetchImpl('https://api.foxentry.com/location/validate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Api-Version': process.env.FOXENTRY_API_VERSION || '2.0',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        request: {
          query: {
            streetWithNumber: query.street,
            city: query.city,
            zip: query.postcode,
            country: 'CZ',
          },
          options: { dataScope: 'basic', zipFormat: false },
        },
      }),
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) return { ...SKIPPED, note: `Foxentry odpověděl ${response.status}` }
    const body = (await response.json()) as {
      response?: {
        result?: { isValid?: boolean | null; proposal?: string; data?: FoxentryData }
        resultCorrected?: { data?: FoxentryData }
        suggestions?: { data?: FoxentryData }[]
      }
    }
    const result = body.response?.result
    if (!result) return SKIPPED
    if (result.proposal === 'valid' || result.isValid === true) {
      return { status: 'valid', note: null, suggestion: null }
    }
    const corrected =
      toAddress(body.response?.resultCorrected?.data) ??
      toAddress(body.response?.suggestions?.[0]?.data)
    if (corrected && !same(corrected, query)) {
      return {
        status: 'corrected',
        note: `Návrh: ${corrected.street}, ${corrected.postcode} ${corrected.city}`,
        suggestion: corrected,
      }
    }
    return { status: 'invalid', note: 'Adresa nebyla nalezena v registru adres.', suggestion: null }
  } catch {
    // Timeout or network error: never block the customer.
    return SKIPPED
  }
}
