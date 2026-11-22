import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestImage, createUser, getTestPayload, type TestUser } from './helpers'

/**
 * Integration test: real Payload (local API) + real PostgreSQL (throwaway database).
 * `overrideAccess: false` makes the local API apply the same access rules as the admin and REST API.
 */

let payload: Payload
let admin: TestUser
let staff: TestUser
let butcher: TestUser
let imageId: number

const variants = [
  { label: '250 g', kind: 'weight' as const, weightGrams: 250 },
  { label: '500 g', kind: 'weight' as const, weightGrams: 500 },
  { label: 'Celý kus', kind: 'piece' as const, weightGrams: 2500 },
]

/** Required product fields that have defaults in the admin. */
const defaults = { priceUnit: 'kg', vatRate: '12', availability: 'in-stock' } as const

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createUser(payload, 'staff', 'prvni@example.test') // first user -> forced admin
  staff = await createUser(payload, 'staff', 'obsluha@example.test')
  butcher = await createUser(payload, 'butcher', 'reznik@example.test')
  imageId = (await createTestImage(payload, 'Testovací obrázek')).id
})

afterAll(async () => {
  // Remove the uploaded test image file from the media/ folder (the database is dropped anyway).
  if (imageId) await payload.delete({ collection: 'media', id: imageId, overrideAccess: true })
  await payload?.destroy()
})

describe('users and roles', () => {
  it('makes the very first user an administrator', () => {
    expect(admin.role).toBe('admin')
    expect(staff.role).toBe('staff')
  })

  it('does not let staff change their own role', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: staff.id,
      data: { role: 'admin', name: 'Obsluha' },
      user: staff,
      overrideAccess: false,
    })
    expect(updated.role).toBe('staff')
    expect(updated.name).toBe('Obsluha')
  })

  it('does not let staff create users', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: { email: 'novy@example.test', password: 'x'.repeat(20), role: 'admin' },
        user: staff,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('does not let anonymous visitors read users', async () => {
    await expect(
      payload.find({ collection: 'users', overrideAccess: false }),
    ).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('products', () => {
  it('lets staff create a published product with variants and generates the slug', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Svíčková Argentina',
        price: 1290,
        priceUnit: 'kg',
        vatRate: '12',
        availability: 'in-stock',
        mainImage: imageId,
        variants,
        _status: 'published',
      },
      user: staff,
      overrideAccess: false,
    })

    expect(product.slug).toBe('svickova-argentina')
    expect(product.variants).toHaveLength(3)
    expect(product.variants?.[2]).toMatchObject({
      label: 'Celý kus',
      kind: 'piece',
      weightGrams: 2500,
    })
    expect(product._status).toBe('published')
  })

  it('appends a number when the generated slug is already taken', async () => {
    const product = await payload.create({
      collection: 'products',
      data: { title: 'Svíčková Argentina', price: 1290, mainImage: imageId, variants },
      user: staff,
      overrideAccess: false,
      draft: true,
    })
    expect(product.slug).toBe('svickova-argentina-2')
  })

  it('does not let the butcher create a product', async () => {
    await expect(
      payload.create({
        collection: 'products',
        data: { ...defaults, title: 'Řezníkův produkt', price: 100, mainImage: imageId, variants },
        user: butcher,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('requires a weight for variants of products priced by weight', async () => {
    await expect(
      payload.create({
        collection: 'products',
        data: {
          ...defaults,
          title: 'Bez hmotnosti',
          price: 990,
          priceUnit: 'kg',
          mainImage: imageId,
          variants: [{ label: '?', kind: 'weight' }],
          _status: 'published',
        },
        user: staff,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('shows anonymous visitors only published, non-hidden products', async () => {
    await payload.create({
      collection: 'products',
      data: { title: 'Rozpracovaný produkt', price: 990, mainImage: imageId, variants },
      user: staff,
      overrideAccess: false,
      draft: true,
    })
    await payload.create({
      collection: 'products',
      data: {
        ...defaults,
        title: 'Skrytý produkt',
        price: 990,
        mainImage: imageId,
        variants,
        availability: 'hidden',
        _status: 'published',
      },
      user: staff,
      overrideAccess: false,
    })

    const publicResult = await payload.find({
      collection: 'products',
      overrideAccess: false,
      limit: 100,
    })
    const publicTitles = publicResult.docs.map((doc) => doc.title)
    expect(publicTitles).toContain('Svíčková Argentina')
    expect(publicTitles).not.toContain('Rozpracovaný produkt')
    expect(publicTitles).not.toContain('Skrytý produkt')

    // Logged-in users (even the read-only butcher) see everything in the admin, incl. drafts.
    const butcherResult = await payload.find({
      collection: 'products',
      user: butcher,
      overrideAccess: false,
      draft: true,
      limit: 100,
    })
    const butcherTitles = butcherResult.docs.map((doc) => doc.title)
    expect(butcherTitles).toEqual(
      expect.arrayContaining(['Svíčková Argentina', 'Rozpracovaný produkt', 'Skrytý produkt']),
    )
  })

  it('does not let anonymous visitors request drafts', async () => {
    const result = await payload.find({
      collection: 'products',
      overrideAccess: false,
      draft: true,
      where: { title: { equals: 'Rozpracovaný produkt' } },
    })
    expect(result.docs).toHaveLength(0)
  })
})

describe('settings and code lists', () => {
  it('lets anyone read settings with the default delivery price, but only admins change them', async () => {
    const settings = await payload.findGlobal({ slug: 'settings', overrideAccess: false })
    expect(settings.deliveryPrice).toBe(229)

    await expect(
      payload.updateGlobal({
        slug: 'settings',
        data: { deliveryPrice: 0 },
        user: staff,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })

    const updated = await payload.updateGlobal({
      slug: 'settings',
      data: { contact: { email: 'info@example.test' } },
      user: admin,
      overrideAccess: false,
    })
    expect(updated.contact?.email).toBe('info@example.test')
  })

  it('lets staff manage code lists but not the butcher', async () => {
    const cut = await payload.create({
      collection: 'cuts',
      data: { name: 'Vysoký roštěnec' },
      user: staff,
      overrideAccess: false,
    })
    expect(cut.slug).toBe('vysoky-rostenec')

    await expect(
      payload.create({
        collection: 'cuts',
        data: { name: 'Picanha' },
        user: butcher,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
