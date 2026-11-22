'use client'

import { useActionState } from 'react'

import { type NewsletterState, subscribeNewsletter } from '@/app/(frontend)/actions/newsletter'

const initial: NewsletterState = { status: 'idle', message: '' }

/** Newsletter signup in the footer (posts to a stub server action until stage 6). */
export function NewsletterForm() {
  const [state, action, pending] = useActionState(subscribeNewsletter, initial)
  return (
    <section className="bg-white py-12 text-center" aria-labelledby="newsletter-title">
      <div className="wrap">
        <h2 id="newsletter-title" className="text-[1.625rem] font-semibold">
          Nechci, aby mi cokoliv uteklo
        </h2>
        <p className="mt-1.5 text-muted">
          Novinky ze sortimentu a recepty. Pár e-mailů do roka, odhlásíte se jedním klikem.
        </p>
        {state.status === 'ok' ? (
          <p role="status" className="mx-auto mt-5 max-w-lg font-semibold text-ok">
            {state.message}
          </p>
        ) : (
          <form
            action={action}
            className="mx-auto mt-5 flex max-w-[32.5rem] flex-col gap-2 sm:flex-row"
            noValidate
          >
            <label htmlFor="newsletter-email" className="sr-only">
              Váš e-mail
            </label>
            <input
              id="newsletter-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="vas@email.cz"
              aria-invalid={state.status === 'error'}
              aria-describedby={state.status === 'error' ? 'newsletter-error' : undefined}
              className="min-w-0 flex-1 rounded-card border border-line px-3.5 py-3"
            />
            {/* Honeypot against bots, hidden from people and screen readers. */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />
            <button type="submit" className="btn" disabled={pending}>
              {pending ? 'Odesílám…' : 'Odebírat'}
            </button>
          </form>
        )}
        {state.status === 'error' ? (
          <p
            id="newsletter-error"
            role="alert"
            className="mt-2 text-sm font-semibold text-brand-red"
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  )
}
