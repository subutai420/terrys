import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { adminOnly, adminOnlyField, adminOrSelf, isAdminUser, ROLE_LABELS, ROLES } from '@/access'

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
  auth: true,
  access: {
    read: adminOrSelf,
    create: adminOnly,
    update: adminOrSelf,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [firstUserIsAdmin],
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
