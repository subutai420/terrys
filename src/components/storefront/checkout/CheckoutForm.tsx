'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'

import type { PublicDeliveryOptions } from '@/delivery/options'
import { trackBeginCheckout } from '@/lib/analytics'
import {
  type DeliveryChoice,
  finishCheckout,
  getCheckoutId,
  markBeginCheckout,
  readDeliveryChoice,
  readDraft,
  saveDeliveryChoice,
  saveDraft,
} from '@/lib/cart/checkoutState'
import { getCartStore } from '@/lib/cart/store'
import { formatPostcode, isValidPostcode, normalizePostcode } from '@/lib/delivery/constants'
import { formatCzk } from '@/lib/format'
import { ATTRIBUTION_STORAGE_KEY, parseStoredAttribution } from '@/lib/orders/attribution'
import type { CartCheckResult } from '@/lib/orders/cartCheck'
import { type FieldErrors, parseCheckoutInput } from '@/lib/orders/checkoutSchema'
import { ORDER_BUTTON_LABEL, THANK_YOU_PATH } from '@/lib/orders/constants'
import { addressLine, dateMeaning, formatDateLong } from '@/lib/orders/format'
import { WEIGHT_TOLERANCE } from '@/lib/productView'

import { CartLines } from './CartLines'
import { DeliveryPicker, methodPriceLabel } from './DeliveryPicker'
import { Field } from './Field'
import { applyCartCheck, lineTotal, useDeliveryOptions, useValidatedCart } from './hooks'
import { checkoutItems, Notices, StepHeading } from './parts'

export type CheckoutPageProps = {
  formToken: string
  priceNotice: string
  termsHref: string
  privacyHref: string
  withdrawalHref: string
  seller: { name: string | null; ico: string | null; address: string | null }
  contact: { email: string | null; phone: string | null }
  turnstileSiteKey: string | null
  addressCheckEnabled: boolean
}

type FormState = {
  firstName: string
  lastName: string
  email: string
  phone: string
  street: string
  city: string
  postcode: string
  isCompany: boolean
  companyName: string
  ico: string
  dic: string
  note: string
  hasVoucher: boolean
  voucherCode: string
  terms: boolean
  newsletter: boolean
  heurekaOptOut: boolean
  website: string
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  street: '',
  city: '',
  postcode: '',
  isCompany: false,
  companyName: '',
  ico: '',
  dic: '',
  note: '',
  hasVoucher: false,
  voucherCode: '',
  terms: false,
  newsletter: false,
  heurekaOptOut: false,
  website: '',
}

/** Form field → path of the error in the validation result. */
const ERROR_PATH: Partial<Record<keyof FormState, string>> = {
  firstName: 'customer.firstName',
  lastName: 'customer.lastName',
  email: 'customer.email',
  phone: 'customer.phone',
  companyName: 'customer.companyName',
  ico: 'customer.ico',
  dic: 'customer.dic',
  street: 'address.street',
  city: 'address.city',
  postcode: 'address.postcode',
  note: 'note',
  voucherCode: 'voucherCode',
  terms: 'consents.terms',
}

/** Order of fields for "focus the first error". */
const FIELD_ORDER: string[] = [
  'delivery.methodId',
  'delivery.date',
  'customer.firstName',
  'customer.lastName',
  'customer.email',
  'customer.phone',
  'address.street',
  'address.city',
  'address.postcode',
  'customer.companyName',
  'customer.ico',
  'customer.dic',
  'note',
  'voucherCode',
  'consents.terms',
]

const percent = Math.round(WEIGHT_TOLERANCE * 100)
/** Empty form, completed from the sessionStorage draft (consents are never restored). */
function initialForm(): FormState {
  if (typeof window === 'undefined') return EMPTY
  const saved = readDeliveryChoice()
  const draft = readDraft<FormState>() ?? {}
  return {
    ...EMPTY,
    ...draft,
    terms: false,
    website: '',
    postcode: saved.postcode ? formatPostcode(saved.postcode) : (draft.postcode ?? ''),
  }
}

const fieldId = (path: string) => `f-${path.replace(/\./g, '-')}`

type AddressHint = { street: string; city: string; postcode: string } | null

/**
 * Checkout (stage 4): ONE page with numbered sections – delivery (from the cart, changeable),
 * contact, address or pickup place, company (optional), note, gift voucher, consents and the
 * pre-contract summary next to the order button. Validated inline with the same schema the
 * server uses; the server re-checks everything (`src/orders/placeOrder.ts`).
 */
export function CheckoutForm(props: CheckoutPageProps) {
  const router = useRouter()
  const { lines, hydrated, notices, setNotices } = useValidatedCart()
  // Browser storage is read in the state initialisers: nothing is rendered from it before
  // hydration (the component shows "Načítáme…" until `hydrated`), so server and client agree.
  const [choice, setChoice] = useState<DeliveryChoice>(() => readDeliveryChoice())
  const [form, setForm] = useState<FormState>(() => initialForm())
  const [checkoutId] = useState(() => (typeof window === 'undefined' ? '' : getCheckoutId()))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null)
  const [editDelivery, setEditDelivery] = useState(false)
  const [addressHint, setAddressHint] = useState<AddressHint>(null)
  const delivery = useDeliveryOptions(choice.postcode)
  const errorSummary = useRef<HTMLDivElement>(null)

  // Keep a draft of the form in sessionStorage (without consents and the honeypot).
  useEffect(() => {
    if (!hydrated) return
    const { terms: _terms, website: _website, ...draft } = form
    void _terms
    void _website
    saveDraft(draft)
  }, [form, hydrated])

  const options: PublicDeliveryOptions | null =
    delivery.state.status === 'ok' ? delivery.state.data : null
  const method = options?.methods.find((m) => m.id === choice.methodId && m.available) ?? null
  const needsAddress = method ? method.type !== 'pickup' : true
  const goodsEstimate = lines.reduce((sum, line) => sum + (lineTotal(line) ?? 0), 0)
  const total = goodsEstimate + (method?.price ?? 0)
  // The picker is open while there is no usable choice, or when the customer wants to change it.
  const deliveryOpen = editDelivery || !method || !choice.date

  // begin_checkout once per checkout, when the cart is known.
  useEffect(() => {
    if (!hydrated || lines.length === 0 || !checkoutId) return
    if (markBeginCheckout(checkoutId)) {
      trackBeginCheckout({
        currency: 'CZK',
        value: goodsEstimate,
        value_is_estimate: true,
        items: checkoutItems(lines),
      })
    }
  }, [hydrated, lines, goodsEstimate, checkoutId])

  const updateChoice = useCallback((next: DeliveryChoice) => {
    setChoice((previous) => {
      if (next.postcode !== previous.postcode && next.postcode) {
        setForm((f) => ({ ...f, postcode: formatPostcode(next.postcode) }))
      }
      return next
    })
    saveDeliveryChoice(next)
  }, [])

  const buildInput = (turnstileToken?: string) => {
    let attribution: unknown
    try {
      attribution =
        parseStoredAttribution(window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY)) ?? undefined
    } catch {
      attribution = undefined
    }
    return {
      checkoutId,
      formToken: props.formToken,
      website: form.website,
      turnstileToken,
      lines: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
      })),
      delivery: {
        postcode: choice.postcode,
        methodId: choice.methodId ?? 0,
        date: choice.date ?? '',
      },
      customer: {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        companyName: form.isCompany ? form.companyName : undefined,
        ico: form.isCompany ? form.ico : undefined,
        dic: form.isCompany ? form.dic : undefined,
      },
      address: needsAddress
        ? { street: form.street, city: form.city, postcode: form.postcode }
        : undefined,
      note: form.note,
      voucherCode: form.hasVoucher ? form.voucherCode : undefined,
      consents: {
        terms: form.terms,
        newsletter: form.newsletter,
        heurekaOptOut: form.heurekaOptOut,
      },
      attribution,
      expectedTotal: total,
    }
  }

  const validateAll = (): FieldErrors => {
    const result = parseCheckoutInput(buildInput(), needsAddress)
    const found: FieldErrors = result.ok ? {} : { ...result.errors }
    if (!method) found['delivery.methodId'] = 'Vyberte způsob dopravy.'
    else if (!choice.date) found['delivery.date'] = 'Vyberte termín.'
    return found
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onBlurField = (key: keyof FormState) => {
    const path = ERROR_PATH[key]
    if (!path) return
    const all = validateAll()
    setErrors((current) => {
      const next = { ...current }
      if (all[path]) next[path] = all[path]
      else delete next[path]
      return next
    })
  }

  const onPostcodeBlur = () => {
    onBlurField('postcode')
    const code = normalizePostcode(form.postcode)
    if (isValidPostcode(code) && code !== choice.postcode) {
      updateChoice({ ...choice, postcode: code })
      setDeliveryMessage(
        'Změnili jste PSČ. Podle nového PSČ jsme znovu načetli dopravu – zkontrolujte prosím způsob dopravy a termín.',
      )
      setEditDelivery(true)
    }
  }

  const checkAddress = async () => {
    if (!props.addressCheckEnabled || !needsAddress) return
    if (!form.street.trim() || !form.city.trim() || !isValidPostcode(form.postcode)) return
    try {
      const response = await fetch('/api/checkout/address-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ street: form.street, city: form.city, postcode: form.postcode }),
      })
      const body = await response.json()
      setAddressHint(body.status === 'corrected' && body.suggestion ? body.suggestion : null)
    } catch {
      setAddressHint(null)
    }
  }

  const focusFirstError = (found: FieldErrors) => {
    const first = FIELD_ORDER.find((path) => found[path])
    if (!first) return
    if (first.startsWith('delivery.')) {
      setEditDelivery(true)
      document.getElementById('doprava')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const element = document.getElementById(fieldId(first))
    element?.focus()
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitted(true)
    setFormMessage(null)
    setServerErrors({})
    const found = validateAll()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      errorSummary.current?.focus()
      focusFirstError(found)
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/checkout/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildInput(
            (document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)
              ?.value || undefined,
          ),
        ),
      })
      const body = await response.json().catch(() => ({}))
      if (response.ok && body.ok) {
        getCartStore().clear()
        finishCheckout()
        router.replace(`${THANK_YOU_PATH}/${body.accessToken}`)
        return
      }
      setFormMessage(body.message ?? 'Objednávku se nepodařilo odeslat. Zkuste to prosím znovu.')
      if (body.error === 'cart-changed' || body.error === 'prices-changed') {
        if (body.cart) setNotices(applyCartCheck(body.cart as CartCheckResult))
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else if (body.error === 'delivery-unavailable') {
        if (body.delivery) delivery.setData(body.delivery as PublicDeliveryOptions)
        setDeliveryMessage(body.message)
        setEditDelivery(true)
        document.getElementById('doprava')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (body.fieldErrors) {
        setServerErrors(body.fieldErrors as FieldErrors)
        focusFirstError(body.fieldErrors as FieldErrors)
      }
    } catch {
      setFormMessage(
        'Nepodařilo se spojit se serverem. Zkontrolujte připojení a zkuste to znovu – objednávka se nezdvojí.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!hydrated) return <p className="card text-muted">Načítáme objednávku…</p>

  if (lines.length === 0) {
    return (
      <div className="space-y-4">
        <Notices notices={notices} />
        <div className="card text-center" data-testid="checkout-empty">
          <p className="font-slab text-xl font-semibold text-brand-brown">V košíku nic není.</p>
          <Link href="/produkty" className="btn mt-4">
            Vybrat maso
          </Link>
        </div>
      </div>
    )
  }

  // After the first submit attempt the messages follow the input live; before it only blurred fields.
  const shownErrors: FieldErrors = submitted
    ? { ...serverErrors, ...validateAll() }
    : { ...errors, ...serverErrors }
  const errorList = FIELD_ORDER.filter((path) => shownErrors[path]).map((path) => ({
    path,
    message: shownErrors[path],
  }))
  const err = (key: keyof FormState) =>
    ERROR_PATH[key] ? shownErrors[ERROR_PATH[key] as string] : undefined
  const field = (key: keyof FormState) => ({
    id: fieldId(ERROR_PATH[key] ?? key),
    name: key,
    value: String(form[key]),
    error: err(key),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value as never),
    onBlur: () => onBlurField(key),
  })
  const pickup = method?.type === 'pickup' ? method.pickupLocation : null

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start"
      data-testid="checkout-form"
    >
      <div className="space-y-6">
        <Notices notices={notices} />
        <div
          ref={errorSummary}
          tabIndex={-1}
          className={
            errorList.length && submitted
              ? 'rounded-card border-l-4 border-brand-red bg-white p-4'
              : 'sr-only'
          }
          role="alert"
          data-testid="error-summary"
        >
          {errorList.length && submitted ? (
            <>
              <p className="font-semibold text-brand-red">Zkontrolujte prosím:</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {errorList.map((item) => (
                  <li key={item.path}>{item.message}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        {/* 1. Delivery */}
        <section className="card scroll-mt-4" id="doprava" aria-labelledby="h-delivery">
          <StepHeading id="h-delivery" number={1}>
            Doprava a termín
          </StepHeading>
          {!deliveryOpen && method && choice.date ? (
            <div
              className="flex flex-wrap items-start justify-between gap-3"
              data-testid="delivery-summary"
            >
              <div>
                <p className="font-bold">
                  {method.name} – {methodPriceLabel(method)}
                </p>
                <p>
                  {dateMeaning(method.type)}: <strong>{formatDateLong(choice.date)}</strong>
                </p>
                {pickup ? (
                  <p className="text-sm text-muted">
                    {[pickup.name, addressLine(pickup)].filter(Boolean).join(', ')}
                  </p>
                ) : (
                  <p className="text-sm text-muted">PSČ {formatPostcode(choice.postcode)}</p>
                )}
              </div>
              <button
                type="button"
                className="text-brand-red underline"
                onClick={() => setEditDelivery(true)}
              >
                Změnit
              </button>
            </div>
          ) : (
            <DeliveryPicker
              choice={choice}
              onChange={(next) => {
                updateChoice(next)
                setDeliveryMessage(null)
              }}
              state={delivery.state}
              message={deliveryMessage}
            />
          )}
          {shownErrors['delivery.methodId'] || shownErrors['delivery.date'] ? (
            <p className="mt-2 text-sm font-semibold text-brand-red">
              {shownErrors['delivery.methodId'] ?? shownErrors['delivery.date']}
            </p>
          ) : null}
          {deliveryOpen && method && choice.date ? (
            <button
              type="button"
              className="btn btn-ghost mt-4"
              onClick={() => setEditDelivery(false)}
            >
              Hotovo
            </button>
          ) : null}
        </section>

        {/* 2. Contact */}
        <section className="card" aria-labelledby="h-contact">
          <StepHeading id="h-contact" number={2}>
            Kontaktní údaje
          </StepHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jméno" autoComplete="given-name" required {...field('firstName')} />
            <Field label="Příjmení" autoComplete="family-name" required {...field('lastName')} />
            <Field
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              help="Pošleme na něj potvrzení objednávky."
              {...field('email')}
            />
            <Field
              label="Telefon"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              help="Řidič nebo řezník vám zavolá, kdyby bylo potřeba."
              {...field('phone')}
            />
          </div>
        </section>

        {/* 3. Address or pickup */}
        <section className="card" aria-labelledby="h-address">
          <StepHeading id="h-address" number={3}>
            {needsAddress ? 'Doručovací adresa' : 'Vyzvednutí'}
          </StepHeading>
          {needsAddress ? (
            <div className="grid gap-4 sm:grid-cols-[2fr_1.4fr_1fr]">
              <Field
                label="Ulice a číslo domu"
                autoComplete="address-line1"
                required
                {...field('street')}
                onBlur={() => {
                  onBlurField('street')
                  void checkAddress()
                }}
              />
              <Field
                label="Obec"
                autoComplete="address-level2"
                required
                {...field('city')}
                onBlur={() => {
                  onBlurField('city')
                  void checkAddress()
                }}
              />
              <Field
                label="PSČ"
                inputMode="numeric"
                autoComplete="postal-code"
                required
                help="Podle PSČ nabízíme dopravu."
                {...field('postcode')}
                onBlur={onPostcodeBlur}
              />
              {addressHint ? (
                <div
                  className="rounded-card bg-brand-beige-light p-3 text-sm sm:col-span-3"
                  role="status"
                >
                  Nemysleli jste{' '}
                  <strong>
                    {addressHint.street}, {formatPostcode(addressHint.postcode)} {addressHint.city}
                  </strong>
                  ?{' '}
                  <button
                    type="button"
                    className="font-semibold text-brand-red underline"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        street: addressHint.street,
                        city: addressHint.city,
                        postcode: formatPostcode(addressHint.postcode),
                      }))
                      if (addressHint.postcode !== choice.postcode)
                        updateChoice({ ...choice, postcode: addressHint.postcode })
                      setAddressHint(null)
                    }}
                  >
                    Použít tuto adresu
                  </button>
                </div>
              ) : null}
            </div>
          ) : pickup ? (
            <div>
              <p className="font-bold">{pickup.name}</p>
              <p>{addressLine(pickup)}</p>
              {pickup.openingHoursNote ? (
                <p className="text-sm text-muted">{pickup.openingHoursNote}</p>
              ) : null}
              <p className="mt-2 text-sm text-muted">
                Adresu nepotřebujeme. Platíte při vyzvednutí.
              </p>
            </div>
          ) : (
            <p className="text-muted">Nejdřív vyberte způsob dopravy.</p>
          )}

          <div className="mt-5 border-t border-line pt-4">
            <label className="flex items-center gap-2.5 font-semibold">
              <input
                type="checkbox"
                checked={form.isCompany}
                onChange={(event) => set('isCompany', event.target.checked)}
                className="h-5 w-5 accent-brand-red"
              />
              Nakupuji na firmu (IČO / DIČ)
            </label>
            {form.isCompany ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field
                  label="Název firmy"
                  autoComplete="organization"
                  optional
                  className="sm:col-span-3"
                  {...field('companyName')}
                />
                <Field label="IČO" inputMode="numeric" optional {...field('ico')} />
                <Field label="DIČ" optional placeholder="CZ12345678" {...field('dic')} />
              </div>
            ) : null}
          </div>
        </section>

        {/* 4. Note and voucher */}
        <section className="card" aria-labelledby="h-note">
          <StepHeading id="h-note" number={4}>
            Poznámka a dárkový poukaz
          </StepHeading>
          <label htmlFor="f-note" className="mb-1 block font-semibold">
            Poznámka pro řezníka <span className="font-normal text-muted">(nepovinné)</span>
          </label>
          <textarea
            id="f-note"
            name="note"
            rows={3}
            maxLength={1000}
            value={form.note}
            onChange={(event) => set('note', event.target.value)}
            className="input"
            placeholder="Např. silnější plátky, nepřekročit 3 000 Kč, zazvonit u vrátnice…"
          />
          <div className="mt-4">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.hasVoucher}
                onChange={(event) => set('hasVoucher', event.target.checked)}
                className="h-5 w-5 accent-brand-red"
              />
              Zaplatím částečně dárkovým poukazem Terrys
            </label>
            {form.hasVoucher ? (
              <div className="mt-3 max-w-sm">
                <Field
                  label="Číslo dárkového poukazu"
                  autoComplete="off"
                  help="Poukaz ověříme ručně a jeho hodnotu odečteme při vážení objednávky. Odhad ceny výše ho zatím nezahrnuje."
                  {...field('voucherCode')}
                />
              </div>
            ) : null}
          </div>
        </section>

        {/* Order lines (read-only reminder) */}
        <section className="card" aria-labelledby="h-items">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="h-items" className="text-xl">
              Objednávané zboží
            </h2>
            <Link href="/kosik" className="text-sm text-brand-red underline">
              Upravit košík
            </Link>
          </div>
          <CartLines lines={lines} editable={false} />
        </section>
      </div>

      {/* Summary, consents and the order button */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <section className="card space-y-3" aria-labelledby="h-summary" data-testid="order-summary">
          <h2 id="h-summary" className="text-xl">
            Shrnutí objednávky
          </h2>
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-4">
              <dt>Odhad za zboží</dt>
              <dd className="font-semibold" data-testid="summary-goods">
                ≈ {formatCzk(goodsEstimate)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{method ? method.name : 'Doprava'}</dt>
              <dd className="text-right font-semibold" data-testid="summary-delivery">
                {method ? (
                  methodPriceLabel(method)
                ) : (
                  <span className="font-normal text-muted">vyberte dopravu</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5">
              <dt className="font-bold leading-tight">
                Odhad celkem
                <span className="block text-sm font-normal text-muted">
                  vč. DPH, platíte při převzetí
                </span>
              </dt>
              <dd
                className="font-slab text-2xl font-bold whitespace-nowrap text-brand-red"
                data-testid="summary-total"
              >
                ≈ {formatCzk(total)}
              </dd>
            </div>
          </dl>

          <div
            className="space-y-2 rounded-card bg-brand-beige-light p-3 text-sm"
            data-testid="precontract-info"
          >
            <p>
              <strong>Cena:</strong> uvedené částky jsou odhad podle průměrné hmotnosti. Řezník
              objednávku zváží a zaplatíte cenu podle skutečné hmotnosti – obvykle se liší do ±
              {percent} %. {props.priceNotice.includes(`${percent}`) ? '' : props.priceNotice}
            </p>
            <p>
              <strong>Platba:</strong> až při převzetí, hotově nebo kartou
              {method?.type === 'pickup' ? ' na výdejním místě' : ' řidiči'}
              {method?.customerNote ? ` (${method.customerNote})` : ''}. Online neplatíte nic.
            </p>
            {method && choice.date ? (
              <p>
                <strong>{dateMeaning(method.type)}:</strong> {formatDateLong(choice.date)},{' '}
                {method.price > 0 ? `doprava ${formatCzk(method.price)}` : 'osobní odběr zdarma'}.
              </p>
            ) : null}
            <p>
              <strong>Odstoupení od smlouvy:</strong> podmínky a případy, kdy ho zákon vylučuje
              (např. zboží podléhající rychlé zkáze), popisují{' '}
              <a href={props.termsHref} target="_blank" rel="noopener" className="underline">
                obchodních podmínek
              </a>{' '}
              (online formulář:{' '}
              <a href={props.withdrawalHref} target="_blank" rel="noopener" className="underline">
                odstoupení od smlouvy
              </a>
              ).
            </p>
            {props.seller.name ? (
              <p>
                <strong>Prodávající:</strong> {props.seller.name}
                {props.seller.ico ? `, IČO ${props.seller.ico}` : ''}
                {props.seller.address ? `, ${props.seller.address}` : ''}
                {props.contact.phone || props.contact.email
                  ? `; ${[props.contact.phone, props.contact.email].filter(Boolean).join(', ')}`
                  : ''}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-line pt-3">
            <label className="flex items-start gap-2.5">
              <input
                id={fieldId('consents.terms')}
                type="checkbox"
                name="terms"
                checked={form.terms}
                onChange={(event) => set('terms', event.target.checked)}
                aria-invalid={shownErrors['consents.terms'] ? true : undefined}
                aria-describedby={shownErrors['consents.terms'] ? 'terms-error' : undefined}
                className="mt-1 h-5 w-5 shrink-0 accent-brand-red"
                data-testid="consent-terms"
              />
              <span>
                Souhlasím s{' '}
                <a
                  href={props.termsHref}
                  target="_blank"
                  rel="noopener"
                  className="font-semibold text-brand-red underline"
                >
                  obchodními podmínkami
                </a>
                .
              </span>
            </label>
            {shownErrors['consents.terms'] ? (
              <p id="terms-error" className="text-sm font-semibold text-brand-red">
                {shownErrors['consents.terms']}
              </p>
            ) : null}
            <p className="text-sm text-muted">
              Vaše údaje použijeme k vyřízení objednávky. Více v{' '}
              <a href={props.privacyHref} target="_blank" rel="noopener" className="underline">
                informacích o zpracování osobních údajů
              </a>
              .
            </p>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="newsletter"
                checked={form.newsletter}
                onChange={(event) => set('newsletter', event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand-red"
                data-testid="consent-newsletter"
              />
              <span>
                Chci dostávat e-maily s novinkami, recepty a tipy od řezníků (odhlásit se lze
                kdykoli).
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="heurekaOptOut"
                checked={form.heurekaOptOut}
                onChange={(event) => set('heurekaOptOut', event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand-red"
                data-testid="consent-heureka"
              />
              <span>
                Nesouhlasím se zasláním dotazníku spokojenosti v rámci programu Ověřeno zákazníky
                (Heureka), který nám pomáhá zlepšovat služby.
              </span>
            </label>
          </div>

          {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="f-website">Web</label>
            <input
              id="f-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => set('website', event.target.value)}
            />
          </div>

          {props.turnstileSiteKey ? (
            <>
              <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
              <div
                className="cf-turnstile"
                data-sitekey={props.turnstileSiteKey}
                data-language="cs"
              />
            </>
          ) : null}

          {formMessage ? (
            <p
              className="rounded-card border-l-4 border-brand-red bg-white p-3 font-semibold text-brand-red"
              role="alert"
              data-testid="form-message"
            >
              {formMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="btn w-full text-[1.0625rem]"
            disabled={submitting}
            data-testid="place-order"
          >
            {submitting ? 'Odesíláme objednávku…' : ORDER_BUTTON_LABEL}
          </button>
          <p className="text-center text-sm text-muted">
            Odesláním se zavazujete zaplatit při převzetí cenu podle skutečné hmotnosti (odhad ≈{' '}
            {formatCzk(total)}).
          </p>
        </section>
      </div>
    </form>
  )
}
