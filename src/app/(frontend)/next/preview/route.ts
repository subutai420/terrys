import config from '@payload-config'
import { draftMode, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { isEditorUser } from '@/access'

/**
 * Editor preview ("Náhled" button in the admin): /next/preview?path=/produkty/…
 *
 * Only a logged-in editor (admin or staff, checked with the Payload login cookie) can turn on
 * Next.js draft mode. In draft mode the storefront shows the latest drafts and hidden products
 * (`src/storefront/data.ts`), bypassing the cache. /next/exit-preview turns it off.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.searchParams.get('path') ?? '/'
  // Only paths on this site (no open redirect to other domains).
  if (!path.startsWith('/') || path.startsWith('//')) {
    return new Response('Neplatná adresa náhledu.', { status: 400 })
  }
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!isEditorUser(user)) {
    return new Response('Náhled konceptů je jen pro přihlášené redaktory.', { status: 403 })
  }
  ;(await draftMode()).enable()
  redirect(path)
}
