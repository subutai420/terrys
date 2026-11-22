import { draftMode } from 'next/headers'

/** Bar shown to editors while the draft preview is on (never to normal visitors). */
export async function DraftBanner() {
  const { isEnabled } = await draftMode()
  if (!isEnabled) return null
  return (
    <div className="bg-brand-gold-light px-4 py-2 text-center text-sm font-semibold text-brand-brown">
      Náhled konceptů: vidíte i nezveřejněné změny.{' '}
      {/* A plain link on purpose: the route handler must run as a full request. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/next/exit-preview" className="underline">
        Ukončit náhled
      </a>
    </div>
  )
}
