import Link from 'next/link'

import type { ListArticle, ListRecipe } from '@/storefront/data'

import { Breadcrumbs, type Crumb } from '../Breadcrumbs'
import { ArticleCard, RecipeCard } from '../Cards'

/** Simple page header used by listings (magazine, academy, recipes, stores, search). */
export function ListingHeader({
  title,
  intro,
  crumbs,
}: {
  title: string
  intro?: string
  crumbs: Crumb[]
}) {
  return (
    <>
      <Breadcrumbs items={crumbs} />
      <header className="pb-7">
        <h1 className="text-[2rem] sm:text-[2.5rem]">{title}</h1>
        {intro ? <p className="mt-3 max-w-2xl text-lg text-muted">{intro}</p> : null}
      </header>
    </>
  )
}

export function ArticleGrid({ articles, kicker }: { articles: ListArticle[]; kicker?: string }) {
  if (articles.length === 0) {
    return <p className="rounded-card bg-white p-8 text-center">Zatím tu nejsou žádné články.</p>
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} kicker={kicker} />
      ))}
    </div>
  )
}

export function RecipeGrid({ recipes }: { recipes: ListRecipe[] }) {
  if (recipes.length === 0) {
    return <p className="rounded-card bg-white p-8 text-center">Zatím tu nejsou žádné recepty.</p>
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  )
}

/** Alphabetical glossary list grouped by first letter. */
export function GlossaryList({ terms }: { terms: { id: number; title: string; href: string }[] }) {
  const collator = new Intl.Collator('cs')
  const groups = new Map<string, typeof terms>()
  for (const term of [...terms].sort((a, b) => collator.compare(a.title, b.title))) {
    const letter = term.title.charAt(0).toLocaleUpperCase('cs')
    groups.set(letter, [...(groups.get(letter) ?? []), term])
  }
  return (
    <div className="columns-1 gap-8 rounded-card bg-white p-6 sm:columns-2 sm:p-8 lg:columns-3">
      {[...groups.entries()].map(([letter, items]) => (
        <section key={letter} className="mb-5 break-inside-avoid">
          <h2 className="mb-1.5 text-2xl text-brand-red">{letter}</h2>
          <ul>
            {items.map((term) => (
              <li key={term.id}>
                <Link href={term.href} className="block py-1 hover:text-brand-red hover:underline">
                  {term.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
