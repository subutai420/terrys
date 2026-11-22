import type { CollectionSlug, FieldHook, TextField } from 'payload'

import { slugify } from '@/lib/slugify'

type SlugFieldOptions = {
  /** Field the slug is generated from. Default `title`. */
  from?: string
}

/** Max attempts to find a free "-2", "-3", ... suffix before giving up and letting validation fail. */
const MAX_SUFFIX = 50

/**
 * Generates and normalises the slug:
 * - empty slug -> generated from the source field (e.g. title "Svíčková" -> "svickova"); if the
 *   generated slug is already used by another document, "-2", "-3", ... is appended,
 * - slug typed by hand -> only normalised (lower case, no diacritics, dashes),
 * - existing slug is never changed automatically when the title changes, because the slug is part
 *   of the page URL and changing it would break links. Clear the field to regenerate it.
 */
const generateSlugHook =
  (from: string): FieldHook =>
  async ({ value, siblingData, originalDoc, collection, req }) => {
    if (typeof value === 'string' && value.trim() !== '') {
      return slugify(value)
    }

    const source = siblingData?.[from] ?? originalDoc?.[from]
    const base = slugify(typeof source === 'string' ? source : '')
    if (!base || !collection) return base || value

    // Find a slug that no other document in this collection uses yet.
    for (let attempt = 1; attempt <= MAX_SUFFIX; attempt++) {
      const candidate = attempt === 1 ? base : `${base}-${attempt}`
      const existing = await req.payload.find({
        collection: collection.slug as CollectionSlug,
        where: {
          and: [
            { slug: { equals: candidate } },
            ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
          ],
        },
        limit: 1,
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
      if (existing.docs.length === 0) return candidate
    }
    return base
  }

/**
 * URL slug field ("adresa stránky v URL"). Unique per collection, editable, shown in the sidebar.
 */
export function slugField({ from = 'title' }: SlugFieldOptions = {}): TextField {
  return {
    name: 'slug',
    type: 'text',
    label: 'Slug (adresa v URL)',
    unique: true,
    index: true,
    // Not `required`: the admin form validates before hooks run, so a required slug would block
    // saving with an empty field. The hook always fills it from the (required) title instead.
    admin: {
      position: 'sidebar',
      description:
        'Část webové adresy, např. „svickova“. Když pole necháte prázdné, vytvoří se samo z názvu ' +
        '(bez diakritiky). Po zveřejnění ho už neměňte – změnou by přestaly fungovat staré odkazy.',
    },
    hooks: {
      beforeValidate: [generateSlugHook(from)],
    },
  }
}
