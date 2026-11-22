import type { Payload, PayloadRequest } from 'payload'

import { publicText } from '@/lib/openingHours'
import { getSiteUrl } from '@/lib/urls'
import { DEFAULT_PAYMENT_DUE_HOURS, type OverdueAction } from '@/lib/vouchers/constants'
import { parseBankAccount } from '@/lib/vouchers/spayd'
import { shopInfo } from '@/orders/emails'
import type { Setting } from '@/payload-types'

import type { VoucherPdfData } from './pdf'

/** Stage 7: voucher settings (Nastavení obchodu → Dárkové poukazy) in a usable shape. */
export type VoucherSettings = {
  /** null = no (valid) account → electronic vouchers cannot be ordered. */
  account: { iban: string; display: string } | null
  dueHours: number
  overdueAction: OverdueAction
  autoCancelAfterDays: number
  pdfShop: VoucherPdfData['shop']
  emailShop: ReturnType<typeof shopInfo>
  settings: Setting
}

export function voucherSettingsFrom(settings: Setting): VoucherSettings {
  const raw = settings.vouchers?.bankAccount?.trim()
  const parsed = raw ? parseBankAccount(raw) : null
  const site = getSiteUrl()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  return {
    account: parsed && parsed.ok ? { iban: parsed.iban, display: parsed.display } : null,
    dueHours: settings.vouchers?.paymentDueHours ?? DEFAULT_PAYMENT_DUE_HOURS,
    overdueAction: (settings.vouchers?.overdueAction as OverdueAction) ?? 'flag-remind',
    autoCancelAfterDays: settings.vouchers?.autoCancelAfterDays ?? 14,
    pdfShop: {
      name: publicText(settings.company?.name) || 'Terrys – řeznictví a steaky',
      web: site.startsWith('localhost') ? 'www.terrys.cz' : site,
      email: publicText(settings.contact?.email),
      phone: publicText(settings.contact?.phone),
      address: publicText(settings.company?.address)?.replace(/\s*\n\s*/g, ', ') ?? null,
    },
    emailShop: shopInfo(settings),
    settings,
  }
}

export async function getVoucherSettings(
  payload: Payload,
  req?: PayloadRequest,
): Promise<VoucherSettings> {
  const settings = await payload.findGlobal({ slug: 'settings', depth: 0, req })
  return voucherSettingsFrom(settings)
}
