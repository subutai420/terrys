/**
 * Browser-side checkout state (stage 4), shared by the cart page and the checkout page:
 *
 * - delivery choice (postcode, method, date) in localStorage – survives closing the tab, like the
 *   cart itself; the server re-checks it on submit anyway,
 * - `checkoutId` – random id of this purchase attempt, sent with the order so a double click or a
 *   retry never creates two orders (reset after a successful order),
 * - the form draft (contact, address…) in sessionStorage only – personal data are not kept in the
 *   browser after the tab is closed.
 *
 * All access is wrapped in try/catch: private mode or blocked storage must not break buying.
 */

export type DeliveryChoice = {
  postcode: string
  methodId: number | null
  date: string | null
}

const DELIVERY_KEY = 'terrys-delivery-v1'
const CHECKOUT_ID_KEY = 'terrys-checkout-id-v1'
const DRAFT_KEY = 'terrys-checkout-draft-v1'
const BEGIN_TRACKED_KEY = 'terrys-begin-checkout-v1'

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return typeof window === 'undefined'
      ? null
      : kind === 'local'
        ? window.localStorage
        : window.sessionStorage
  } catch {
    return null
  }
}

function readJson<T>(kind: 'local' | 'session', key: string): T | null {
  try {
    const raw = storage(kind)?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(kind: 'local' | 'session', key: string, value: unknown): void {
  try {
    if (value === null) storage(kind)?.removeItem(key)
    else storage(kind)?.setItem(key, JSON.stringify(value))
  } catch {
    // ignore (storage full or blocked)
  }
}

export function readDeliveryChoice(): DeliveryChoice {
  const value = readJson<Partial<DeliveryChoice>>('local', DELIVERY_KEY)
  return {
    postcode: typeof value?.postcode === 'string' ? value.postcode : '',
    methodId: typeof value?.methodId === 'number' ? value.methodId : null,
    date: typeof value?.date === 'string' ? value.date : null,
  }
}

export function saveDeliveryChoice(choice: DeliveryChoice): void {
  writeJson('local', DELIVERY_KEY, choice)
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // Very old browsers: RFC 4122 v4 from Math.random (only used as an idempotency key).
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = (Math.random() * 16) | 0
      return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
    })
  }
}

/** The id of the current purchase attempt (created on first use). */
export function getCheckoutId(): string {
  const existing = readJson<string>('local', CHECKOUT_ID_KEY)
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing
  const id = newId()
  writeJson('local', CHECKOUT_ID_KEY, id)
  return id
}

/** After a successful order: next purchase gets a new id, the draft and delivery date go. */
export function finishCheckout(): void {
  writeJson('local', CHECKOUT_ID_KEY, null)
  writeJson('session', DRAFT_KEY, null)
  const choice = readDeliveryChoice()
  // Keep the postcode for the next purchase, forget the method/date.
  saveDeliveryChoice({ postcode: choice.postcode, methodId: null, date: null })
}

export function readDraft<T>(): Partial<T> | null {
  return readJson<Partial<T>>('session', DRAFT_KEY)
}

export function saveDraft(draft: unknown): void {
  writeJson('session', DRAFT_KEY, draft)
}

/** begin_checkout fires once per checkoutId. Returns true the first time. */
export function markBeginCheckout(checkoutId: string): boolean {
  if (readJson<string>('session', BEGIN_TRACKED_KEY) === checkoutId) return false
  writeJson('session', BEGIN_TRACKED_KEY, checkoutId)
  return true
}
