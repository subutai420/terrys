'use client'

import Script from 'next/script'
import { type FormEvent, useState } from 'react'

import type { FieldErrors } from '@/lib/orders/checkoutSchema'
import { parseWithdrawalInput } from '@/lib/orders/withdrawalSchema'

import { Field } from './Field'

type Props = { formToken: string; turnstileSiteKey: string | null }

type State = {
  name: string
  email: string
  orderNumber: string
  phone: string
  items: string
  message: string
  website: string
}

/**
 * Online withdrawal function (two steps, as the EU directive 2023/2673 and the Czech proposal
 * § 1830a OZ describe): 1) "Odstoupit od smlouvy zde" opens the form, 2) "Potvrdit odstoupení od
 * smlouvy" sends it. Only identification data are required, never a reason.
 */
export function WithdrawalForm({ formToken, turnstileSiteKey }: Props) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({
    name: '',
    email: '',
    orderNumber: '',
    phone: '',
    items: '',
    message: '',
    website: '',
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState<{ submittedAt: string; emailSent: boolean } | null>(null)

  const input = () => ({
    ...state,
    formToken,
    turnstileToken:
      (document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)
        ?.value || undefined,
  })

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseWithdrawalInput(input())
    if (!parsed.ok) {
      setErrors(parsed.errors)
      const first = ['name', 'email', 'orderNumber'].find((key) => parsed.errors[key])
      if (first) document.getElementById(`w-${first}`)?.focus()
      return
    }
    setErrors({})
    setSending(true)
    setMessage(null)
    try {
      const response = await fetch('/api/checkout/withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input()),
      })
      const body = await response.json().catch(() => ({}))
      if (response.ok && body.ok) {
        setDone({ submittedAt: body.submittedAt, emailSent: body.emailSent })
      } else {
        setMessage(body.message ?? 'Odeslání se nezdařilo. Zkuste to prosím znovu.')
        if (body.fieldErrors) setErrors(body.fieldErrors)
      }
    } catch {
      setMessage('Nepodařilo se spojit se serverem. Zkuste to prosím znovu.')
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <div className="card border-l-4 border-ok" role="status" data-testid="withdrawal-done">
        <h2 className="text-xl">Odstoupení od smlouvy jsme přijali</h2>
        <p className="mt-2">
          Odesláno{' '}
          {new Date(done.submittedAt).toLocaleString('cs-CZ', {
            timeZone: 'Europe/Prague',
            dateStyle: 'long',
            timeStyle: 'medium',
          })}
          .{' '}
          {done.emailSent
            ? `Potvrzení s obsahem odstoupení jsme poslali na ${state.email}.`
            : 'Potvrzovací e-mail se nepodařilo odeslat – odstoupení přesto evidujeme a ozveme se vám.'}
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn"
        onClick={() => setOpen(true)}
        data-testid="withdrawal-open"
      >
        Odstoupit od smlouvy zde
      </button>
    )
  }

  const field = (key: keyof State) => ({
    id: `w-${key}`,
    name: key,
    value: state[key],
    error: errors[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setState((s) => ({ ...s, [key]: event.target.value })),
  })

  return (
    <form onSubmit={onSubmit} noValidate className="card space-y-4" data-testid="withdrawal-form">
      <h2 className="text-xl">Odstoupení od smlouvy</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jméno a příjmení" autoComplete="name" required {...field('name')} />
        <Field
          label="E-mail"
          type="email"
          autoComplete="email"
          required
          help="Ten, který jste uvedli v objednávce. Pošleme na něj potvrzení."
          {...field('email')}
        />
        <Field
          label="Číslo objednávky"
          inputMode="numeric"
          required
          help="Najdete ho v potvrzovacím e-mailu."
          {...field('orderNumber')}
        />
        <Field label="Telefon" type="tel" autoComplete="tel" optional {...field('phone')} />
      </div>
      <div>
        <label htmlFor="w-items" className="mb-1 block font-semibold">
          Čeho se odstoupení týká <span className="font-normal text-muted">(nepovinné)</span>
        </label>
        <textarea
          id="w-items"
          rows={3}
          className="input"
          maxLength={2000}
          value={state.items}
          onChange={(event) => setState((s) => ({ ...s, items: event.target.value }))}
          aria-describedby="w-items-help"
        />
        <p id="w-items-help" className="mt-1 text-sm text-muted">
          Když pole necháte prázdné, týká se odstoupení celé objednávky.
        </p>
      </div>
      <div>
        <label htmlFor="w-message" className="mb-1 block font-semibold">
          Zpráva pro nás <span className="font-normal text-muted">(nepovinné)</span>
        </label>
        <textarea
          id="w-message"
          rows={3}
          className="input"
          maxLength={2000}
          value={state.message}
          onChange={(event) => setState((s) => ({ ...s, message: event.target.value }))}
        />
      </div>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="w-website">Web</label>
        <input
          id="w-website"
          tabIndex={-1}
          autoComplete="off"
          value={state.website}
          onChange={(event) => setState((s) => ({ ...s, website: event.target.value }))}
        />
      </div>
      {turnstileSiteKey ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-language="cs" />
        </>
      ) : null}
      {message ? (
        <p className="font-semibold text-brand-red" role="alert">
          {message}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={sending} data-testid="withdrawal-confirm">
        {sending ? 'Odesíláme…' : 'Potvrdit odstoupení od smlouvy'}
      </button>
    </form>
  )
}
