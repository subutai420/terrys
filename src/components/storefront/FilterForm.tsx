'use client'

import Form from 'next/form'
import Link from 'next/link'
import { useId, useRef, useState } from 'react'

import { DEFAULT_SORT, type Facet, SORT_OPTIONS, type SortValue } from '@/lib/filters'

type Props = {
  action: string
  facets: Facet[]
  sort: SortValue
  activeCount: number
  /** Element id the sort select is rendered into (toolbar above the grid). */
  formId: string
}

/**
 * Sidebar filters as a plain GET form (works without JavaScript via the "Použít filtry" button).
 * With JavaScript every change submits the form right away; next/form navigates client-side,
 * so the URL (?puvod=…&rez=…) always describes the list and can be shared.
 */
export function FilterForm({ action, facets, sort, activeCount, formId }: Props) {
  const form = useRef<HTMLFormElement>(null)
  const panelId = useId()
  // Mobile: filters are collapsed behind a button; desktop: always visible in the sidebar.
  const [open, setOpen] = useState(false)
  const submit = () => form.current?.requestSubmit()

  return (
    <Form action={action} ref={form} id={formId} scroll={false} className="contents">
      <div className="rounded-card bg-white">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-12 w-full items-center justify-between px-5 font-slab font-semibold text-brand-brown lg:hidden"
        >
          Filtry{activeCount > 0 ? ` (${activeCount})` : ''}
          <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
        <div
          id={panelId}
          className={`px-5 pt-1 pb-5 lg:block lg:pt-5 ${open ? 'block' : 'hidden'}`}
        >
          {facets.map((facet) => (
            <fieldset key={facet.key} className="mt-4 first:mt-0">
              <legend className="mb-2 w-full border-b-2 border-brand-beige pb-1.5 font-slab text-[1.0625rem] font-semibold text-brand-brown">
                {facet.label}
              </legend>
              {facet.options.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2.5 py-1 text-[0.9375rem]"
                >
                  <input
                    type="checkbox"
                    name={facet.key}
                    value={option.value}
                    defaultChecked={option.selected}
                    onChange={submit}
                    className="h-[1.125rem] w-[1.125rem] accent-brand-red"
                    data-testid={`filter-${facet.key}-${option.value}`}
                  />
                  <span className="flex-1">{option.label}</span>
                  <span className="text-sm text-muted">{option.count}</span>
                </label>
              ))}
            </fieldset>
          ))}
          {/* The sort order is kept when filters change. */}
          <input
            type="hidden"
            name={sort === DEFAULT_SORT ? undefined : 'razeni'}
            defaultValue={sort}
            data-sort
          />
          <noscript>
            <button type="submit" className="btn mt-4 w-full">
              Použít filtry
            </button>
          </noscript>
          {activeCount > 0 ? (
            <Link
              href={action}
              className="mt-4 inline-block font-semibold text-brand-red hover:underline"
            >
              Zrušit filtry
            </Link>
          ) : null}
        </div>
      </div>
    </Form>
  )
}

/** Sort select in the toolbar; writes into the hidden field of the filter form and submits it. */
export function SortSelect({ sort, formId }: { sort: SortValue; formId: string }) {
  return (
    <label className="flex items-center gap-2 text-[0.9375rem]">
      Řadit podle
      <select
        defaultValue={sort}
        onChange={(event) => {
          const formEl = document.getElementById(formId) as HTMLFormElement | null
          // The hidden copy inside the form must follow the select.
          const hidden = formEl?.querySelector<HTMLInputElement>('input[type=hidden][data-sort]')
          if (hidden) {
            hidden.value = event.target.value
            // The default order is not written to the URL.
            if (event.target.value === DEFAULT_SORT) hidden.removeAttribute('name')
            else hidden.name = 'razeni'
          }
          formEl?.requestSubmit()
        }}
        className="rounded-card border border-line bg-white px-2.5 py-2"
        data-testid="sort-select"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
