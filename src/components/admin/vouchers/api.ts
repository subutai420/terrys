'use client'

/** Browser helper of the voucher admin screens: JSON to /api/gift-vouchers/* (admin session). */
export type VoucherApiResponse<T = unknown> = {
  ok: boolean
  message?: string
  messages?: string[]
  fieldErrors?: Record<string, string>
  data?: T
}

export async function voucherApi<T = unknown>(
  path: string,
  body?: unknown,
): Promise<VoucherApiResponse<T>> {
  try {
    const response = await fetch(`/api/gift-vouchers/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await response.json().catch(() => null)) as VoucherApiResponse<T> | null
    if (!data) return { ok: false, message: `Server odpověděl chybou ${response.status}.` }
    return { ...data, ok: response.ok && data.ok !== false }
  } catch {
    return {
      ok: false,
      message: 'Spojení se serverem selhalo. Zkontrolujte internet a zkuste to znovu.',
    }
  }
}

export function apiText(data: VoucherApiResponse): string {
  return [data.message, ...Object.values(data.fieldErrors ?? {}), ...(data.messages ?? [])]
    .filter(Boolean)
    .join(' ')
}

export type VoucherViewData = {
  id: number
  code: string
  type: 'electronic' | 'printed' | 'legacy'
  status: string
  value: number
  balance: number
  expiresOn: string
  orderNumber: string | null
  orderId: number | null
  recipientName: string | null
  paidAt: string | null
  redemptions: {
    orderNumber: string | null
    orderId: number | null
    amount: number
    at: string | null
  }[]
  history: { event: string; at: string | null; note: string | null }[]
}
