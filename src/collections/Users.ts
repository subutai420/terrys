import type { CollectionConfig } from 'payload'

/**
 * Admin users (shop staff). Only logged-in users can access the admin panel.
 * Customer accounts are NOT stored here; they will get their own collection later if needed.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: 'Uživatel',
    plural: 'Uživatelé',
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name'],
  },
  auth: true,
  fields: [
    // Email and password fields are added automatically by `auth: true`.
    {
      name: 'name',
      type: 'text',
      label: 'Jméno',
    },
  ],
}
