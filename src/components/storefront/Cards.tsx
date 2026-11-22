import Link from 'next/link'

import { getPublicPath } from '@/lib/urls'
import type { ListArticle, ListRecipe } from '@/storefront/data'

import { MediaImage } from './MediaImage'

const dateFormatter = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Prague',
})

export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date)
}

/** Article teaser (magazine, academy, glossary listings and the homepage). */
export function ArticleCard({ article, kicker }: { article: ListArticle; kicker?: string }) {
  const href = getPublicPath('articles', article)
  return (
    <Link href={href} className="group flex flex-col overflow-hidden rounded-card bg-white">
      <div className="relative aspect-[16/10] bg-brand-beige-light">
        <MediaImage
          media={article.coverImage}
          size="card"
          alt=""
          fill
          sizes="(min-width: 64rem) 400px, (min-width: 40rem) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col px-4.5 pt-4 pb-5">
        {kicker ? <small className="font-bold text-brand-red">{kicker}</small> : null}
        <h3 className="mt-1 text-xl group-hover:underline">{article.title}</h3>
        {article.perex ? (
          <p className="mt-2 line-clamp-3 text-[0.9375rem] text-muted">{article.perex}</p>
        ) : null}
      </div>
    </Link>
  )
}

export function RecipeCard({ recipe }: { recipe: ListRecipe }) {
  const href = getPublicPath('recipes', recipe)
  const minutes = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0)
  return (
    <Link href={href} className="group flex flex-col overflow-hidden rounded-card bg-white">
      <div className="relative aspect-[16/10] bg-brand-beige-light">
        <MediaImage
          media={recipe.coverImage}
          size="card"
          alt=""
          fill
          sizes="(min-width: 64rem) 400px, (min-width: 40rem) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col px-4.5 pt-4 pb-5">
        <small className="font-bold text-brand-red">
          Recept{minutes > 0 ? ` · ${minutes} min` : ''}
        </small>
        <h3 className="mt-1 text-xl group-hover:underline">{recipe.title}</h3>
        {recipe.perex ? (
          <p className="mt-2 line-clamp-3 text-[0.9375rem] text-muted">{recipe.perex}</p>
        ) : null}
      </div>
    </Link>
  )
}
