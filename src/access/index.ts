import type { Access, FieldAccess, Where } from 'payload'

/**
 * Central access control (who may do what in the admin and the API).
 *
 * Roles (one per user, stored in `users.role`):
 * - `admin`   – everything, including users, settings and locations.
 * - `staff`   – obsluha: manages products, categories, code lists, content and media.
 *               Cannot manage users, settings or locations.
 * - `butcher` – řezník: read-only access to the admin for now (later stages: weighing orders).
 *
 * Anonymous visitors (the public storefront) may read only published, non-hidden content.
 *
 * Use these helpers in collection configs instead of writing ad-hoc checks, so the rules stay
 * in one place. Unit tests: `access.test.ts`.
 */

export const ROLES = ['admin', 'staff', 'butcher'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrátor',
  staff: 'Obsluha',
  butcher: 'Řezník',
}

/** Minimal shape of the logged-in user that the helpers need. */
type UserLike = { role?: string | null } | null | undefined

/** True when the user has one of the given roles. */
export function hasRole(user: UserLike, ...roles: Role[]): boolean {
  return Boolean(user?.role && (roles as string[]).includes(user.role))
}

/** Roles that may create and edit catalog and content. */
export const EDITOR_ROLES: Role[] = ['admin', 'staff']

export const isAdminUser = (user: UserLike): boolean => hasRole(user, 'admin')
export const isEditorUser = (user: UserLike): boolean => hasRole(user, ...EDITOR_ROLES)

// ---------------------------------------------------------------------------
// Collection-level access functions
// ---------------------------------------------------------------------------

/** Everyone, including anonymous visitors. */
export const anyone: Access = () => true

/** Any logged-in admin user (admin, staff or butcher). */
export const loggedIn: Access = ({ req }) => Boolean(req.user)

/** Only administrators. */
export const adminOnly: Access = ({ req }) => isAdminUser(req.user)

/** Administrators and staff (obsluha) – the people who edit catalog and content. */
export const editors: Access = ({ req }) => isEditorUser(req.user)

/** Query constraint for documents the public may see: published (drafts are never public). */
export const PUBLISHED_ONLY: Where = { _status: { equals: 'published' } }

/**
 * Read access for collections with drafts (products, articles, recipes, pages):
 * logged-in users see everything incl. drafts, anonymous visitors only published documents.
 */
export const publishedOrLoggedIn: Access = ({ req }) => {
  if (req.user) return true
  return PUBLISHED_ONLY
}

/**
 * Read access for products: like `publishedOrLoggedIn`, and additionally anonymous visitors
 * never see products with availability "hidden" (skryto).
 */
export const publicProductsOrLoggedIn: Access = ({ req }) => {
  if (req.user) return true
  return {
    and: [PUBLISHED_ONLY, { availability: { not_equals: 'hidden' } }],
  }
}

/**
 * Users collection: administrators may read/update every user, others only themselves.
 */
export const adminOrSelf: Access = ({ req }) => {
  if (!req.user) return false
  if (isAdminUser(req.user)) return true
  return { id: { equals: req.user.id } }
}

// ---------------------------------------------------------------------------
// Field-level access functions (return booleans only)
// ---------------------------------------------------------------------------

/** Field may be set/changed only by administrators (e.g. a user's role). */
export const adminOnlyField: FieldAccess = ({ req }) => isAdminUser(req.user)
