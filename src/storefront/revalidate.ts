import { revalidatePath, revalidateTag } from 'next/cache'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  PayloadRequest,
} from 'payload'

/**
 * On-demand revalidation of the storefront (stage 3).
 *
 * Caching model (details in CLAUDE.md → "Storefront"):
 * - storefront pages are statically generated / ISR, and the data loaders in
 *   `src/storefront/data.ts` are cached with `unstable_cache` under the single tag
 *   `STOREFRONT_TAG`;
 * - every change of public content in the admin calls `revalidateStorefront()`, which marks the
 *   tag and all storefront pages as stale. The next visitor of any page gets fresh data
 *   (`expire: 0` = no stale content is served after an edit).
 *
 * One coarse tag on purpose: the shop has a few hundred pages and edits are rare, so re-rendering
 * on demand is cheap, while fine-grained tags (which category shows which product, menus,
 * related products, the homepage…) would be easy to get wrong.
 *
 * Outside a Next.js request (pnpm seed, the migration import, integration tests) Next's cache
 * functions throw; that is ignored – there is no server cache to clear in those processes.
 * Pass `context: { disableRevalidate: true }` to skip it explicitly.
 */
export const STOREFRONT_TAG = 'storefront'

export function revalidateStorefront(req?: Pick<PayloadRequest, 'context'>): void {
  if (req?.context?.disableRevalidate) return
  try {
    revalidateTag(STOREFRONT_TAG, { expire: 0 })
    revalidatePath('/', 'layout')
  } catch {
    // Not running inside Next.js (CLI script or test): nothing to revalidate.
  }
}

/** Drafts do not change the public site, unless a published document is being unpublished. */
function affectsPublicSite(doc: unknown, previousDoc: unknown): boolean {
  const status = (doc as { _status?: string } | undefined)?._status
  const previousStatus = (previousDoc as { _status?: string } | undefined)?._status
  if (status === 'draft' && previousStatus !== 'published') return false
  return true
}

export const revalidateAfterChange: CollectionAfterChangeHook = ({ doc, previousDoc, req }) => {
  if (affectsPublicSite(doc, previousDoc)) revalidateStorefront(req)
  return doc
}

export const revalidateAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  revalidateStorefront(req)
  return doc
}

export const revalidateGlobalAfterChange: GlobalAfterChangeHook = ({ doc, req }) => {
  revalidateStorefront(req)
  return doc
}

/** Hooks to spread into a collection config: `hooks: { ...storefrontRevalidationHooks }`. */
export const storefrontRevalidationHooks = {
  afterChange: [revalidateAfterChange],
  afterDelete: [revalidateAfterDelete],
}
