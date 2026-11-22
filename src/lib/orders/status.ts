import type { ShippingMethodType } from '../delivery/constants'
import { ORDER_STATUS_LABELS, type OrderStatus } from './constants'

/**
 * Stage 5 – the order status flow and its guard (pure, unit-tested in `status.test.ts`).
 *
 *   received ──► weighed ──► shipped ──────────► delivered        (own van, courier)
 *      ▲            │   └──► ready-for-pickup ─► picked-up        (pickup)
 *      └────────────┘ (staff re-opens the weighing)
 *   received / weighed / shipped / ready-for-pickup ──► cancelled (staff, reason required)
 *
 * Who: the butcher may only do received → weighed. Staff and admin may do everything allowed.
 * `delivered` / `picked-up` are set by hand today; a later tracking sync (Balíkobot TRACK, see
 * CLAUDE.md) could set `delivered` for courier parcels through the same guard.
 */

export type GuardRole = 'admin' | 'staff' | 'butcher' | null | undefined

export type TransitionFacts = {
  from: OrderStatus
  to: OrderStatus
  role: GuardRole
  methodType: ShippingMethodType | null | undefined
  /** Every line resolved (see `isWeighingComplete`). */
  weighingComplete: boolean
  /** Final price confirmed by staff (`finalisedAt` set). */
  finalised: boolean
  /** Courier: a tracking number exists (shipment created or typed in). */
  hasTracking: boolean
  /** Cancellation reason (required for → cancelled). */
  reason?: string | null
}

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  received: ['weighed', 'cancelled'],
  weighed: ['received', 'shipped', 'ready-for-pickup', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  'ready-for-pickup': ['picked-up', 'cancelled'],
  delivered: [],
  'picked-up': [],
  cancelled: [],
}

export type TransitionResult = { ok: true } | { ok: false; reason: string }

const no = (reason: string): TransitionResult => ({ ok: false, reason })

export function checkTransition(facts: TransitionFacts): TransitionResult {
  const { from, to, role, methodType } = facts
  if (from === to) return no('Objednávka už tento stav má.')
  if (!role) return no('Nejste přihlášeni.')
  if (!ALLOWED[from].includes(to)) {
    return no(
      `Ze stavu „${ORDER_STATUS_LABELS[from]}“ nelze přejít na „${ORDER_STATUS_LABELS[to]}“.`,
    )
  }
  if (role === 'butcher' && !(from === 'received' && to === 'weighed')) {
    return no('Řezník může objednávku jen označit jako zváženou.')
  }
  switch (to) {
    case 'weighed':
      return facts.weighingComplete
        ? { ok: true }
        : no('Nejdřív zvažte všechny položky (nebo je označte jako nedostupné).')
    case 'shipped':
      if (methodType !== 'own-delivery' && methodType !== 'courier') {
        return no('„Odesláno“ je jen pro rozvoz a kurýra. Osobní odběr: „Připraveno k odběru“.')
      }
      if (!facts.finalised) return no('Nejdřív potvrďte vyúčtování (výslednou cenu).')
      if (methodType === 'courier' && !facts.hasTracking) {
        return no('Nejdřív vytvořte zásilku (nebo zadejte číslo zásilky).')
      }
      return { ok: true }
    case 'ready-for-pickup':
      if (methodType !== 'pickup') return no('„Připraveno k odběru“ je jen pro osobní odběr.')
      if (!facts.finalised) return no('Nejdřív potvrďte vyúčtování (výslednou cenu).')
      return { ok: true }
    case 'cancelled':
      return facts.reason?.trim() ? { ok: true } : no('Napište důvod zrušení.')
    default:
      return { ok: true }
  }
}

/** Statuses the user may move to next (for the buttons), with the reason when not allowed. */
export function nextStatuses(
  facts: Omit<TransitionFacts, 'to' | 'reason'>,
): { to: OrderStatus; result: TransitionResult }[] {
  return ALLOWED[facts.from]
    .filter((to) => {
      if (to === 'shipped') return facts.methodType !== 'pickup'
      if (to === 'ready-for-pickup') return facts.methodType === 'pickup'
      return true
    })
    .map((to) => ({ to, result: checkTransition({ ...facts, to, reason: 'x' }) }))
}
