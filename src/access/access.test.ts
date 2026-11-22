import type { Access, FieldAccess } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  adminOnly,
  adminOnlyField,
  adminOrSelf,
  anyone,
  editors,
  hasRole,
  loggedIn,
  PUBLISHED_ONLY,
  publicProductsOrLoggedIn,
  publishedOrLoggedIn,
} from './index'

type TestUser = { id: number; role: string } | null

const admin: TestUser = { id: 1, role: 'admin' }
const staff: TestUser = { id: 2, role: 'staff' }
const butcher: TestUser = { id: 3, role: 'butcher' }
const anonymous: TestUser = null

/** Calls an access function with a minimal fake request containing only the user. */
function run(fn: Access | FieldAccess, user: TestUser) {
  return fn({ req: { user } } as unknown as Parameters<Access>[0])
}

describe('hasRole', () => {
  it('matches any of the given roles', () => {
    expect(hasRole(admin, 'admin')).toBe(true)
    expect(hasRole(staff, 'admin', 'staff')).toBe(true)
    expect(hasRole(butcher, 'admin', 'staff')).toBe(false)
  })

  it('is false for anonymous users and users without a role', () => {
    expect(hasRole(null, 'admin')).toBe(false)
    expect(hasRole(undefined, 'admin')).toBe(false)
    expect(hasRole({ role: null }, 'admin')).toBe(false)
    expect(hasRole({ role: 'unknown' }, 'admin', 'staff', 'butcher')).toBe(false)
  })
})

describe('collection access', () => {
  it('anyone allows everybody', () => {
    for (const user of [admin, staff, butcher, anonymous]) expect(run(anyone, user)).toBe(true)
  })

  it('loggedIn allows every role but not anonymous visitors', () => {
    expect(run(loggedIn, admin)).toBe(true)
    expect(run(loggedIn, staff)).toBe(true)
    expect(run(loggedIn, butcher)).toBe(true)
    expect(run(loggedIn, anonymous)).toBe(false)
  })

  it('adminOnly allows only administrators', () => {
    expect(run(adminOnly, admin)).toBe(true)
    expect(run(adminOnly, staff)).toBe(false)
    expect(run(adminOnly, butcher)).toBe(false)
    expect(run(adminOnly, anonymous)).toBe(false)
  })

  it('editors allows admin and staff, not butcher', () => {
    expect(run(editors, admin)).toBe(true)
    expect(run(editors, staff)).toBe(true)
    expect(run(editors, butcher)).toBe(false)
    expect(run(editors, anonymous)).toBe(false)
  })

  it('publishedOrLoggedIn restricts anonymous visitors to published documents', () => {
    expect(run(publishedOrLoggedIn, butcher)).toBe(true)
    expect(run(publishedOrLoggedIn, staff)).toBe(true)
    expect(run(publishedOrLoggedIn, anonymous)).toEqual(PUBLISHED_ONLY)
  })

  it('publicProductsOrLoggedIn also hides products with availability "hidden"', () => {
    expect(run(publicProductsOrLoggedIn, staff)).toBe(true)
    expect(run(publicProductsOrLoggedIn, anonymous)).toEqual({
      and: [PUBLISHED_ONLY, { availability: { not_equals: 'hidden' } }],
    })
  })

  it('adminOrSelf lets admins see everyone and others only themselves', () => {
    expect(run(adminOrSelf, admin)).toBe(true)
    expect(run(adminOrSelf, staff)).toEqual({ id: { equals: 2 } })
    expect(run(adminOrSelf, butcher)).toEqual({ id: { equals: 3 } })
    expect(run(adminOrSelf, anonymous)).toBe(false)
  })
})

describe('field access', () => {
  it('adminOnlyField allows only administrators', () => {
    expect(run(adminOnlyField, admin)).toBe(true)
    expect(run(adminOnlyField, staff)).toBe(false)
    expect(run(adminOnlyField, butcher)).toBe(false)
    expect(run(adminOnlyField, anonymous)).toBe(false)
  })
})
