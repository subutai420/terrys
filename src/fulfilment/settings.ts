import type { Payload, PayloadRequest } from 'payload'

import { DEFAULT_WEIGHT_TOLERANCE_PERCENT } from '@/lib/orders/constants'

/** Stage 5 settings with safe defaults (settings saved before stage 5 lack the fields). */
export async function getFulfilmentSettings(payload: Payload, req?: PayloadRequest) {
  const settings = await payload.findGlobal({ slug: 'settings', depth: 0, req })
  const tolerance = settings.orders?.weightTolerancePercent
  const packaging = settings.orders?.packagingWeightGrams
  return {
    settings,
    tolerancePercent:
      typeof tolerance === 'number' && tolerance > 0 ? tolerance : DEFAULT_WEIGHT_TOLERANCE_PERCENT,
    packagingWeightGrams: typeof packaging === 'number' && packaging >= 0 ? packaging : 1000,
  }
}

export async function getTolerancePercent(payload: Payload, req?: PayloadRequest) {
  return (await getFulfilmentSettings(payload, req)).tolerancePercent
}
