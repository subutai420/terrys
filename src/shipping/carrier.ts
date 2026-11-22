import {
  BALIKOBOT_DEFAULT_URL,
  buildAddRequest,
  type CarrierError,
  parseAddResponse,
  parseDropResponse,
  parseLabelsResponse,
  parseOrderResponse,
  type ShipmentInput,
  shipmentEid,
  statusMessage,
  validateShipmentInput,
} from '@/lib/shipping/balikobot'
import { type LabelPage, simplePdf } from '@/lib/shipping/pdf'

/**
 * Carrier-agnostic shipping service (stage 5). The order screens only talk to this interface;
 * today there are two implementations:
 *
 * - `balikobot` (LIVE): Balíkobot API v2 over HTTPS with Basic auth from env
 *   (`BALIKOBOT_API_USER`, `BALIKOBOT_API_KEY`, optional `BALIKOBOT_API_URL`).
 * - `simulation`: no network at all. Returns a fake tracking number ("SIM…") and a placeholder
 *   PDF label, and the order is marked "simulated". Used automatically when the credentials are
 *   missing – except in production, where it must be switched on explicitly with
 *   `BALIKOBOT_SIMULATION=1` (so customers never get a fake tracking link by accident).
 *
 * Another aggregator or a direct carrier API = one more implementation of `CarrierService`.
 */

export type CreateShipmentResult =
  | {
      ok: true
      packageId: string
      trackingNumber: string
      trackingUrl: string | null
      labelUrl: string | null
      simulated: boolean
    }
  | { ok: false; errors: string[] }

export type PdfResult = { ok: true; pdf: Buffer } | { ok: false; errors: string[] }

export type CloseBatchResult =
  | { ok: true; batchId: string | null; handoverUrl: string | null; simulated: boolean }
  | { ok: false; errors: string[] }

export interface CarrierService {
  mode: 'live' | 'simulation'
  createShipment(input: ShipmentInput): Promise<CreateShipmentResult>
  /** Deletes a package that was NOT handed over yet (Balíkobot DROP). */
  cancelShipment(
    carrierCode: string,
    packageId: string,
  ): Promise<{ ok: true } | { ok: false; errors: string[] }>
  /** One PDF with the labels of the given packages. `labelUrl` = stored URL for a single label. */
  labels(
    carrierCode: string,
    packages: { packageId: string; labelUrl?: string | null; page: LabelPage }[],
  ): Promise<PdfResult>
  /** Hands the packages over to the carrier (Balíkobot ORDER, "uzavření svozu"). */
  closeBatch(carrierCode: string, packageIds: string[]): Promise<CloseBatchResult>
}

export class CarrierNotConfiguredError extends Error {
  constructor() {
    super(
      'Balíkobot není nastaven: doplňte BALIKOBOT_API_USER a BALIKOBOT_API_KEY, nebo pro ' +
        'zkoušení zapněte simulaci BALIKOBOT_SIMULATION=1.',
    )
  }
}

const errorsText = (errors: CarrierError[]) =>
  errors.map((e) => {
    const attr = e.attribute
    return attr && attr !== 'carrier_error' ? `${attr}: ${e.message}` : e.message
  })

// ------------------------------------------------------------------------------- simulation

let simCounter = 0

export function simulationCarrier(): CarrierService {
  return {
    mode: 'simulation',
    async createShipment(input) {
      const errors = validateShipmentInput(input, { simulation: true })
      if (errors.length) return { ok: false, errors }
      simCounter = (simCounter + 1) % 1000
      const trackingNumber = `SIM${Date.now().toString().slice(-8)}${String(simCounter).padStart(3, '0')}`
      return {
        ok: true,
        packageId: `sim-${shipmentEid(input.orderNumber, input.attempt)}`,
        trackingNumber,
        // A clearly fake address (.invalid never resolves) – never a real carrier link.
        trackingUrl: `https://simulace.balikobot.invalid/sledovani/${trackingNumber}`,
        labelUrl: null,
        simulated: true,
      }
    },
    async cancelShipment() {
      return { ok: true }
    },
    async labels(_carrier, packages) {
      if (!packages.length) return { ok: false, errors: ['Žádné štítky k tisku.'] }
      return { ok: true, pdf: simplePdf(packages.map((p) => p.page)) }
    },
    async closeBatch(carrierCode) {
      return {
        ok: true,
        batchId: `sim-order-${carrierCode}-${Date.now()}`,
        handoverUrl: null,
        simulated: true,
      }
    },
  }
}

// ------------------------------------------------------------------------------- Balíkobot

type FetchLike = typeof fetch

export function balikobotCarrier(config: {
  user: string
  key: string
  baseUrl?: string
  fetchImpl?: FetchLike
}): CarrierService {
  const base = (config.baseUrl || BALIKOBOT_DEFAULT_URL).replace(/\/$/, '')
  const doFetch = config.fetchImpl ?? fetch
  const auth = `Basic ${Buffer.from(`${config.user}:${config.key}`).toString('base64')}`

  async function call(carrier: string, method: string, body: unknown) {
    if (!/^[a-z0-9]+$/.test(carrier)) {
      return { status: 0, json: null as unknown, error: `Neplatný kód dopravce „${carrier}“.` }
    }
    try {
      const response = await doFetch(`${base}/${carrier}/${method}`, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
      const json = await response.json().catch(() => null)
      return { status: response.status, json, error: null }
    } catch (error) {
      return {
        status: 0,
        json: null,
        error: `Balíkobot je nedostupný (${error instanceof Error ? error.message : String(error)}).`,
      }
    }
  }

  async function download(url: string): Promise<PdfResult> {
    // Only Balíkobot's own PDF hosts; never fetch arbitrary URLs from a response.
    let host = ''
    try {
      host = new URL(url).host
    } catch {
      return { ok: false, errors: ['Neplatný odkaz na štítek.'] }
    }
    if (!/(^|\.)balikobot\.cz$/.test(host)) {
      return { ok: false, errors: [`Štítek je na neočekávané adrese (${host}).`] }
    }
    try {
      const response = await doFetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok)
        return { ok: false, errors: [`Štítek se nepodařilo stáhnout (${response.status}).`] }
      return { ok: true, pdf: Buffer.from(await response.arrayBuffer()) }
    } catch (error) {
      return { ok: false, errors: [`Štítek se nepodařilo stáhnout: ${String(error)}`] }
    }
  }

  return {
    mode: 'live',
    async createShipment(input) {
      const errors = validateShipmentInput(input)
      if (errors.length) return { ok: false, errors }
      const res = await call(input.carrierCode, 'add', buildAddRequest(input))
      if (res.error) return { ok: false, errors: [res.error] }
      const parsed = parseAddResponse(res.status, res.json)
      if (!parsed.ok) return { ok: false, errors: errorsText(parsed.errors) }
      return { ...parsed, ok: true, simulated: false }
    },
    async cancelShipment(carrierCode, packageId) {
      const res = await call(carrierCode, 'drop', { package_ids: [packageId] })
      if (res.error) return { ok: false, errors: [res.error] }
      const parsed = parseDropResponse(res.status, res.json)
      return parsed.ok ? { ok: true } : { ok: false, errors: errorsText(parsed.errors) }
    },
    async labels(carrierCode, packages) {
      if (packages.length === 1 && packages[0].labelUrl) return download(packages[0].labelUrl)
      const res = await call(carrierCode, 'labels', {
        package_ids: packages.map((p) => p.packageId),
      })
      if (res.error) return { ok: false, errors: [res.error] }
      const parsed = parseLabelsResponse(res.status, res.json)
      if (!parsed.ok) return { ok: false, errors: errorsText(parsed.errors) }
      return download(String(parsed.data.labels_url))
    },
    async closeBatch(carrierCode, packageIds) {
      if (!packageIds.length) return { ok: false, errors: [statusMessage(406)] }
      const res = await call(carrierCode, 'order', { package_ids: packageIds })
      if (res.error) return { ok: false, errors: [res.error] }
      const parsed = parseOrderResponse(res.status, res.json)
      if (!parsed.ok) return { ok: false, errors: errorsText(parsed.errors) }
      return {
        ok: true,
        batchId: typeof parsed.data.order_id === 'string' ? parsed.data.order_id : null,
        handoverUrl: typeof parsed.data.handover_url === 'string' ? parsed.data.handover_url : null,
        simulated: false,
      }
    },
  }
}

/** Which carrier service runs now (see the file header). Throws when nothing is configured. */
export function getCarrierService(env: NodeJS.ProcessEnv = process.env): CarrierService {
  const user = env.BALIKOBOT_API_USER?.trim()
  const key = env.BALIKOBOT_API_KEY?.trim()
  if (env.BALIKOBOT_SIMULATION === '1') return simulationCarrier()
  if (user && key) return balikobotCarrier({ user, key, baseUrl: env.BALIKOBOT_API_URL })
  if (env.NODE_ENV === 'production') throw new CarrierNotConfiguredError()
  return simulationCarrier()
}

/** For the screens: "live" / "simulation" / "missing" without throwing. */
export function carrierMode(
  env: NodeJS.ProcessEnv = process.env,
): 'live' | 'simulation' | 'missing' {
  try {
    return getCarrierService(env).mode
  } catch {
    return 'missing'
  }
}
