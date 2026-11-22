'use client'

/** Browser helper of the fulfilment screens: POST JSON to /api/fulfilment/* (admin session). */
export type ApiResponse = {
  ok: boolean
  message?: string
  messages?: string[]
  fieldErrors?: Record<string, string>
  details?: string[]
  done?: string[]
  failed?: { orderNumber: string; message: string }[]
  skipped?: string[]
}

export async function postJson(path: string, body: unknown): Promise<ApiResponse> {
  try {
    const response = await fetch(`/api/fulfilment/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const data = (await response.json().catch(() => null)) as ApiResponse | null
    if (!data) return { ok: false, message: `Server odpověděl chybou ${response.status}.` }
    return { ...data, ok: response.ok && data.ok !== false }
  } catch {
    return {
      ok: false,
      message: 'Spojení se serverem selhalo. Zkontrolujte internet a zkuste to znovu.',
    }
  }
}

/** One readable text from a response (for toasts). */
export function responseText(data: ApiResponse): string {
  return [data.message, ...(data.details ?? []), ...(data.messages ?? [])].filter(Boolean).join(' ')
}
