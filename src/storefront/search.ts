import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql, type SQL } from '@payloadcms/db-postgres/drizzle'

import { DIACRITICS_FROM, DIACRITICS_TO, searchTerms } from '@/lib/text'

import { type CardProduct, getPayloadClient, getProductsByIds } from './data'

/**
 * Product search for `/vyhledavani?ProductsSearch=…` (the old URL, used in ads).
 *
 * Matches every search word (AND) in the product name, short and long description, cut (incl. its
 * second name) and origin, ignoring case and Czech diacritics: "svickova" finds "Svíčková".
 * Diacritics are removed in SQL with `translate()` using the same character table as
 * `foldDiacritics()` in `src/lib/text.ts`, so no Postgres extension or extra column is needed.
 * Descriptions are Lexical JSON; only their `text` values are searched (`jsonb_path_query_array`).
 *
 * Ranking: name matches first, then cut/origin, then description; in-stock before sold-out.
 * Visibility: the SQL pre-selects only published, non-hidden products, and the final load goes
 * through `getProductsByIds()` with the public access rules again.
 */

const MAX_RESULTS = 60

function folded(expression: SQL): SQL {
  return sql`translate(lower(coalesce(${expression}, '')), ${DIACRITICS_FROM.toLowerCase()}, ${DIACRITICS_TO.toLowerCase()})`
}

function jsonText(column: string): SQL {
  return sql`coalesce(jsonb_path_query_array(${sql.raw(column)}, 'strict $.**.text')::text, '')`
}

export async function searchProductIds(query: string): Promise<number[]> {
  const terms = searchTerms(query)
  if (terms.length === 0) return []
  const payload = await getPayloadClient()
  const db = (payload.db as unknown as PostgresAdapter).drizzle

  const title = folded(sql`p.title`)
  const facets = folded(
    sql`concat_ws(' ', c.name, c.alternative_name, o.name, o.adjective, p.marbling)`,
  )
  const text = folded(
    sql`${jsonText('p.short_description')} || ' ' || ${jsonText('p.description')}`,
  )

  const conditions = terms.map((term) => {
    const pattern = `%${term}%`
    return sql`(${title} LIKE ${pattern} OR ${facets} LIKE ${pattern} OR ${text} LIKE ${pattern})`
  })
  const scores = terms.map((term) => {
    const pattern = `%${term}%`
    return sql`(CASE WHEN ${title} LIKE ${pattern} THEN 4 WHEN ${facets} LIKE ${pattern} THEN 2 ELSE 1 END)`
  })

  const result = await db.execute(sql`
    SELECT p.id
    FROM products p
    LEFT JOIN cuts c ON c.id = p.cut_id
    LEFT JOIN origins o ON o.id = p.origin_id
    WHERE p._status = 'published'
      AND p.availability <> 'hidden'
      AND ${sql.join(conditions, sql` AND `)}
    ORDER BY (${sql.join(scores, sql` + `)}) DESC,
      CASE p.availability WHEN 'in-stock' THEN 0 WHEN 'in-transit' THEN 1 ELSE 2 END,
      p.title
    LIMIT ${MAX_RESULTS}
  `)
  return (result.rows as { id: number }[]).map((row) => Number(row.id))
}

export async function searchProducts(query: string): Promise<CardProduct[]> {
  const ids = await searchProductIds(query)
  return getProductsByIds(ids)
}
