import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type CollectionConfig,
} from 'payload'

import { adminOnly, adminOnlyField, adminOrSelf, isAdminUser, ROLE_LABELS, ROLES } from '@/access'

import { clientIp, createRateLimiter } from '@/lib/orders/rateLimit'

import { ADMIN_GROUPS } from './adminGroups'

/**
 * The very first user created in an empty database always becomes an administrator,
 * so nobody can lock themselves out by creating a first user with a lower role.
 */
const firstUserIsAdmin: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true, req })
  if (totalDocs === 0) {
    return { ...data, role: 'admin' }
  }
  return data
}

/**
 * Stage 9: per-IP limit on login and "forgot password" attempts, on top of Payload's per-account
 * lock (`maxLoginAttempts` / `lockTime` below). Payload's lock protects one account; this stops one
 * address from trying many accounts. In memory, per server instance (see rateLimit.ts): on
 * serverless each warm instance counts separately, so the real limit is "limit × instances" – still
 * a strong brake on password guessing. Local API calls without an IP (seed, tests, scripts) are
 * trusted server code and not limited.
 */
const loginLimiter = createRateLimiter({ limit: 20, windowMs: 15 * 60_000 })

const limitLoginAttempts: CollectionBeforeOperationHook = ({ operation, req }) => {
  if (operation !== 'login' && operation !== 'forgotPassword') return
  if (process.env.RATE_LIMIT_DISABLED === '1' || !req.headers) return
  const ip = clientIp(req.headers)
  if (ip === 'unknown') return
  if (!loginLimiter.hit(ip)) {
    throw new APIError(
      'Příliš mnoho pokusů o přihlášení z této adresy. Zkuste to prosím za 15 minut znovu.',
      429,
    )
  }
}

/**
 * Admin users (shop staff). Only logged-in users can access the admin panel.
 * Customer accounts are NOT stored here; they will get their own collection later if needed.
 *
 * Roles are described in `src/access/index.ts`. Only administrators can create users and change
 * roles; everybody can edit their own name and password.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: 'Uživatel',
    plural: 'Uživatelé',
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role'],
    group: ADMIN_GROUPS.settings,
    description: 'Lidé, kteří se mohou přihlásit do administrace. Spravuje jen administrátor.',
    // Non-admins do not see the Users list in the sidebar (they can still edit their own account).
    hidden: ({ user }) => !isAdminUser(user as { role?: string | null }),
  },
  // Stage 9: login hardening. Defaults of Payload 3.94 (read in the source, the docs list none):
  // maxLoginAttempts 5, lockTime 10 min, tokenExpiration 2 h, sessions on, cookie SameSite=Lax,
  // secure=false. Set explicitly so they are visible and reviewed:
  auth: {
    // After 5 wrong passwords the ACCOUNT is locked for 15 minutes (an admin can unlock it in
    // Uživatelé → the user → "Odemknout").
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    // 2 hours; the admin UI refreshes the token while somebody is working.
    tokenExpiration: 2 * 60 * 60,
    // Server-side sessions: logging out or changing the password ends the session for real.
    useSessions: true,
    cookies: {
      sameSite: 'Lax',
      // Only over https (production). Plain http://localhost would never get the cookie back.
      secure: (process.env.NEXT_PUBLIC_SERVER_URL ?? '').startsWith('https://'),
    },
  },
  access: {
    read: adminOrSelf,
    create: adminOnly,
    update: adminOrSelf,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [firstUserIsAdmin],
    beforeOperation: [limitLoginAttempts],
  },
  fields: [
    // Email and password fields are added automatically by `auth: true`.
    {
      name: 'name',
      type: 'text',
      label: 'Jméno',
    },
    {
      name: 'role',
      type: 'select',
      label: 'Role',
      required: true,
      defaultValue: 'staff',
      // Stored in the login token so access checks do not need an extra database query.
      saveToJWT: true,
      options: ROLES.map((role) => ({ label: ROLE_LABELS[role], value: role })),
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      admin: {
        position: 'sidebar',
        description:
          'Administrátor: vše včetně uživatelů a nastavení. Obsluha: produkty, kategorie, ' +
          'číselníky, obsah a obrázky. Řezník: zatím jen prohlížení (později vážení objednávek). ' +
          'Roli může měnit jen administrátor. První vytvořený uživatel je vždy administrátor.',
      },
    },
  ],
}
