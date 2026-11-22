'use client'

import { useEffect, useId, useState } from 'react'

import type { PublicDeliveryMethod } from '@/delivery/options'
import type { DeliveryChoice } from '@/lib/cart/checkoutState'
import { formatPostcode, isValidPostcode, normalizePostcode } from '@/lib/delivery/constants'
import { formatCzk } from '@/lib/format'
import { addressLine, formatDateChip, formatDateLong } from '@/lib/orders/format'

import type { DeliveryState } from './hooks'

type Props = {
  choice: DeliveryChoice
  onChange: (choice: DeliveryChoice) => void
  state: DeliveryState
  /** Shown above the methods (e.g. "the date is no longer available"). */
  message?: string | null
  /** The checkout shows the postcode in the address instead (it changes it from there). */
  showPostcodeInput?: boolean
}

export function methodPriceLabel(method: Pick<PublicDeliveryMethod, 'price' | 'type'>): string {
  return method.price > 0 ? formatCzk(method.price) : 'zdarma'
}

/**
 * Step "Doprava a termín": postcode → available methods (unavailable ones explained with the
 * Czech reasons of the stage 2 engine) → selectable days only. Native radio buttons, so keyboard
 * and screen readers work without extra code.
 */
export function DeliveryPicker({
  choice,
  onChange,
  state,
  message,
  showPostcodeInput = true,
}: Props) {
  const id = useId()
  const [postcodeInput, setPostcodeInput] = useState(
    choice.postcode ? formatPostcode(choice.postcode) : '',
  )
  const [postcodeError, setPostcodeError] = useState<string | null>(null)

  // Keep the input in sync when the postcode changes elsewhere (checkout address) –
  // adjusting state during render, as recommended by React instead of an effect.
  const [syncedPostcode, setSyncedPostcode] = useState(choice.postcode)
  if (syncedPostcode !== choice.postcode) {
    setSyncedPostcode(choice.postcode)
    setPostcodeInput(choice.postcode ? formatPostcode(choice.postcode) : '')
  }

  const data = state.status === 'ok' ? state.data : null
  const methods = data?.methods ?? []
  const selected = methods.find((m) => m.id === choice.methodId && m.available) ?? null

  // Drop a choice that is no longer possible (another postcode, cut-off passed…).
  useEffect(() => {
    if (!data) return
    const method = data.methods.find((m) => m.id === choice.methodId)
    if (choice.methodId !== null && (!method || !method.available)) {
      onChange({ ...choice, methodId: null, date: null })
    } else if (method && choice.date && !method.dates.includes(choice.date)) {
      onChange({ ...choice, date: null })
    }
  }, [data, choice, onChange])

  const submitPostcode = () => {
    const code = normalizePostcode(postcodeInput)
    if (!isValidPostcode(code)) {
      setPostcodeError('Zadejte PSČ jako pět číslic, např. 120 00.')
      return
    }
    setPostcodeError(null)
    if (code !== choice.postcode) onChange({ postcode: code, methodId: null, date: null })
  }

  const deliveryMethods = methods.filter((m) => m.type !== 'pickup')
  const pickupOnly =
    data !== null &&
    deliveryMethods.length > 0 &&
    deliveryMethods.every((m) => !m.available) &&
    methods.some((m) => m.type === 'pickup' && m.available)

  return (
    <div className="space-y-5" data-testid="delivery-picker">
      {showPostcodeInput ? (
        <div>
          <label htmlFor={`${id}-psc`} className="mb-1.5 block font-semibold">
            PSČ, kam chcete maso doručit
          </label>
          <div className="flex max-w-sm gap-2">
            <input
              id={`${id}-psc`}
              name="postal-code"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="např. 120 00"
              value={postcodeInput}
              onChange={(event) => setPostcodeInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitPostcode()
                }
              }}
              aria-invalid={postcodeError ? true : undefined}
              aria-describedby={`${id}-psc-help`}
              className="input w-36"
              data-testid="postcode-input"
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={submitPostcode}
              data-testid="postcode-submit"
            >
              Zobrazit dopravu
            </button>
          </div>
          <p
            id={`${id}-psc-help`}
            className={`mt-1.5 text-sm ${postcodeError ? 'text-brand-red' : 'text-muted'}`}
          >
            {postcodeError ??
              (state.status === 'error'
                ? state.message
                : 'Podle PSČ vám ukážeme, jak a kdy můžeme maso dovézt. Osobní odběr je vždy zdarma.')}
          </p>
        </div>
      ) : null}

      {state.status === 'loading' ? (
        <p className="text-muted" role="status">
          Načítáme možnosti dopravy…
        </p>
      ) : null}

      {message ? (
        <p
          className="rounded-card border-l-4 border-brand-red bg-white p-3 font-semibold text-brand-red"
          role="alert"
        >
          {message}
        </p>
      ) : null}

      {data ? (
        <>
          {pickupOnly ? (
            <p className="rounded-card bg-brand-beige-light p-3 text-sm" data-testid="pickup-only">
              Na PSČ {data.postcode.formatted}
              {data.postcode.city ? ` (${data.postcode.city})` : ''} bohužel nevozíme. Objednávku si
              ale můžete vyzvednout osobně – zdarma.
            </p>
          ) : null}
          <fieldset>
            <legend className="mb-2 font-semibold">
              Způsob dopravy pro PSČ {data.postcode.formatted}
              {data.postcode.city ? `, ${data.postcode.city}` : ''}
            </legend>
            <div className="space-y-2">
              {methods.map((method) => {
                const inputId = `${id}-m-${method.id}`
                const checked = choice.methodId === method.id && method.available
                const place = method.pickupLocation
                return (
                  <div key={method.id}>
                    <input
                      type="radio"
                      id={inputId}
                      name={`${id}-method`}
                      value={method.id}
                      checked={checked}
                      disabled={!method.available}
                      onChange={() =>
                        onChange({ ...choice, methodId: method.id, date: method.dates[0] ?? null })
                      }
                      className="peer sr-only"
                      data-testid="method-option"
                    />
                    <label
                      htmlFor={inputId}
                      className={`flex gap-3 rounded-card border-2 bg-white p-3.5 transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-gold-dark ${
                        method.available
                          ? 'cursor-pointer border-line hover:border-brand-brown peer-checked:border-brand-red'
                          : 'cursor-not-allowed border-dashed border-line bg-brand-beige-light text-muted'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${checked ? 'border-brand-red bg-brand-red shadow-[inset_0_0_0_3px_#fff]' : 'border-line'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-bold text-ink">{method.name}</span>
                          <span
                            className={`font-bold ${method.price > 0 ? 'text-ink' : 'text-ok'}`}
                          >
                            {methodPriceLabel(method)}
                          </span>
                        </span>
                        {place ? (
                          <span className="block text-sm text-muted">
                            {[place.name, addressLine(place)].filter(Boolean).join(', ')}
                          </span>
                        ) : null}
                        {method.available ? (
                          <>
                            {method.customerNote ? (
                              <span className="block text-sm text-muted">
                                {method.customerNote}
                              </span>
                            ) : null}
                            {method.dates[0] ? (
                              <span className="block text-sm text-muted">
                                Nejbližší termín: {formatDateLong(method.dates[0])} (při objednání
                                do {method.cutoffTime})
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="block text-sm" data-testid="method-unavailable">
                            {method.message}
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>
          </fieldset>

          {selected ? (
            <fieldset>
              <legend className="mb-2 font-semibold">
                {selected.type === 'pickup'
                  ? 'Kdy si objednávku vyzvednete?'
                  : 'Kdy vám ji máme dovézt?'}
              </legend>
              <div className="flex flex-wrap gap-2" data-testid="date-options">
                {selected.dates.map((date) => {
                  const inputId = `${id}-d-${date}`
                  const chip = formatDateChip(date)
                  return (
                    <div key={date}>
                      <input
                        type="radio"
                        id={inputId}
                        name={`${id}-date`}
                        value={date}
                        checked={choice.date === date}
                        onChange={() => onChange({ ...choice, date })}
                        className="peer sr-only"
                        data-testid="date-option"
                      />
                      <label
                        htmlFor={inputId}
                        className="flex min-w-[4.25rem] cursor-pointer flex-col items-center rounded-card border border-line bg-white px-2.5 py-1.5 leading-tight peer-checked:border-brand-brown peer-checked:bg-brand-brown peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-gold-dark hover:border-brand-brown"
                        aria-label={formatDateLong(date)}
                      >
                        <span className="text-xs uppercase">{chip.weekday}</span>
                        <span className="font-bold">{chip.day}</span>
                      </label>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-sm text-muted">
                Zobrazujeme jen dny, kdy{' '}
                {selected.type === 'pickup' ? 'je výdej otevřený' : 'k vám jezdíme'}.
              </p>
            </fieldset>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
