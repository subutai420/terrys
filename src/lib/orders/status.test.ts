import { describe, expect, it } from 'vitest'

import { checkTransition, nextStatuses, type TransitionFacts } from './status'

const facts = (over: Partial<TransitionFacts>): TransitionFacts => ({
  from: 'received',
  to: 'weighed',
  role: 'staff',
  methodType: 'own-delivery',
  weighingComplete: true,
  finalised: true,
  hasTracking: true,
  reason: null,
  ...over,
})

describe('checkTransition', () => {
  it('received → weighed needs every line resolved', () => {
    expect(checkTransition(facts({})).ok).toBe(true)
    expect(checkTransition(facts({ weighingComplete: false })).ok).toBe(false)
  })

  it('butcher may only mark weighed', () => {
    expect(checkTransition(facts({ role: 'butcher' })).ok).toBe(true)
    expect(checkTransition(facts({ role: 'butcher', from: 'weighed', to: 'shipped' })).ok).toBe(
      false,
    )
    expect(checkTransition(facts({ role: 'butcher', to: 'cancelled', reason: 'x' })).ok).toBe(false)
    expect(checkTransition(facts({ role: null })).ok).toBe(false)
  })

  it('shipped only for delivery methods, after the billing is confirmed; courier needs tracking', () => {
    expect(checkTransition(facts({ from: 'weighed', to: 'shipped' })).ok).toBe(true)
    expect(checkTransition(facts({ from: 'weighed', to: 'shipped', finalised: false })).ok).toBe(
      false,
    )
    expect(
      checkTransition(facts({ from: 'weighed', to: 'shipped', methodType: 'pickup' })).ok,
    ).toBe(false)
    expect(
      checkTransition(
        facts({ from: 'weighed', to: 'shipped', methodType: 'courier', hasTracking: false }),
      ).ok,
    ).toBe(false)
    expect(
      checkTransition(facts({ from: 'weighed', to: 'shipped', methodType: 'courier' })).ok,
    ).toBe(true)
  })

  it('ready-for-pickup only for pickup', () => {
    expect(
      checkTransition(facts({ from: 'weighed', to: 'ready-for-pickup', methodType: 'pickup' })).ok,
    ).toBe(true)
    expect(checkTransition(facts({ from: 'weighed', to: 'ready-for-pickup' })).ok).toBe(false)
  })

  it('illegal jumps and final states are refused', () => {
    expect(checkTransition(facts({ from: 'received', to: 'shipped' })).ok).toBe(false)
    expect(checkTransition(facts({ from: 'shipped', to: 'picked-up' })).ok).toBe(false)
    expect(checkTransition(facts({ from: 'delivered', to: 'cancelled', reason: 'x' })).ok).toBe(
      false,
    )
    expect(checkTransition(facts({ from: 'cancelled', to: 'received' })).ok).toBe(false)
    expect(checkTransition(facts({ from: 'weighed', to: 'weighed' })).ok).toBe(false)
    expect(checkTransition(facts({ from: 'shipped', to: 'delivered' })).ok).toBe(true)
    expect(checkTransition(facts({ from: 'weighed', to: 'received' })).ok).toBe(true)
  })

  it('cancellation needs a reason', () => {
    const result = checkTransition(facts({ to: 'cancelled' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/důvod/i)
    expect(checkTransition(facts({ to: 'cancelled', reason: 'Zákazník volal' })).ok).toBe(true)
  })
})

describe('nextStatuses', () => {
  it('offers only the buttons that fit the delivery method', () => {
    const pickup = nextStatuses({ ...facts({}), from: 'weighed', methodType: 'pickup' }).map(
      (s) => s.to,
    )
    expect(pickup).toEqual(['received', 'ready-for-pickup', 'cancelled'])
    const van = nextStatuses({ ...facts({}), from: 'weighed' }).map((s) => s.to)
    expect(van).toEqual(['received', 'shipped', 'cancelled'])
  })
})
