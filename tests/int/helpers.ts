import { randomBytes } from 'crypto'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { inject } from 'vitest'

import type { User } from '@/payload-types'

/**
 * Starts Payload against the throwaway test database created by `globalSetup.ts`.
 * The config reads DATABASE_URL when it is imported, so the variable is set first and the
 * config is imported dynamically afterwards.
 */
export async function getTestPayload(): Promise<Payload> {
  process.env.DATABASE_URL = inject('intDatabaseUrl')
  process.env.PAYLOAD_SECRET ||= 'int-test-only-not-a-real-secret'

  const { getPayload } = await import('payload')
  const { default: config } = await import('@payload-config')
  return getPayload({ config })
}

/** A logged-in user as the local API expects it in `user` (with the collection slug). */
export type TestUser = User & { collection: 'users' }

/** Creates an admin-panel user with the given role and a random password. */
export async function createUser(
  payload: Payload,
  role: User['role'],
  email: string,
): Promise<TestUser> {
  const user = await payload.create({
    collection: 'users',
    data: { email, password: randomBytes(16).toString('hex'), role },
    overrideAccess: true,
  })
  return { ...user, collection: 'users' }
}

/** Uploads a small generated image (products require a main photo). */
export async function createTestImage(payload: Payload, alt: string) {
  const data = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 176, g: 0, b: 4 } },
  })
    .png()
    .toBuffer()

  return payload.create({
    collection: 'media',
    data: { alt },
    file: { data, mimetype: 'image/png', name: `test-${Date.now()}.png`, size: data.length },
    overrideAccess: true,
  })
}
