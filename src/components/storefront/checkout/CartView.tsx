'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

import { trackAddShippingInfo } from '@/lib/analytics'
import {
  type DeliveryChoice,
  readDeliveryChoice,
  saveDeliveryChoice,
} from '@/lib/cart/checkoutState'
import { CHECKOUT_PATH } from '@/lib/orders/constants'

import { CartLines } from './CartLines'
import { DeliveryPicker } from './DeliveryPicker'
import { checkoutItems, Notices, StepHeading } from './parts'
import { lineTotal, useDeliveryOptions, useValidatedCart } from './hooks'
import { OrderSummary } from './OrderSummary'

type Props = { priceNotice: string; deliveryInfoHref: string | null }

/**
 * Cart page (stage 4): lines (re-validated against the server on load) → step 1 postcode,
 * delivery method and date → summary → "Pokračovat k objednávce" (checkout page).
 */
export function CartView({ priceNotice, deliveryInfoHref }: Props) {
  const router = useRouter()
  const { lines, hydrated, status, notices } = useValidatedCart()
  // Read once in the browser; nothing is rendered from it before hydration (see below).
  const [choice, setChoice] = useState<DeliveryChoice>(() => readDeliveryChoice())
  const [continueError, setContinueError] = useState<string | null>(null)
  const delivery = useDeliveryOptions(choice.postcode)

  const updateChoice = useCallback((next: DeliveryChoice) => {
    setChoice(next)
    saveDeliveryChoice(next)
    setContinueError(null)
  }, [])

  if (!hydrated) {
    return <p className="card text-muted">Načítáme košík…</p>
  }

  if (lines.length === 0) {
    return (
      <div className="space-y-4">
        <Notices notices={notices} />
        <div className="card text-center" data-testid="cart-empty">
          <p className="font-slab text-xl font-semibold text-brand-brown">
            Košík je zatím prázdný.
          </p>
          <p className="mt-2 text-muted">
            Vyberte si steak nebo jiné maso – řezník ho naporcuje, zváží a přivezeme ho chlazené.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/produkty" className="btn">
              Vybrat maso
            </Link>
            {deliveryInfoHref ? (
              <Link href={deliveryInfoHref} className="btn btn-ghost">
                Doprava a platba
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  const goodsEstimate = lines.reduce((sum, line) => sum + (lineTotal(line) ?? 0), 0)
  const options = delivery.state.status === 'ok' ? delivery.state.data : null
  const method = options?.methods.find((m) => m.id === choice.methodId && m.available) ?? null
  const ready = Boolean(method && choice.date && method.dates.includes(choice.date))

  const onContinue = () => {
    if (!ready || !method || !choice.date) {
      setContinueError(
        choice.postcode
          ? 'Vyberte prosím způsob dopravy a termín.'
          : 'Nejdřív zadejte PSČ – podle něj vám nabídneme dopravu a termíny.',
      )
      document.getElementById('doprava')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    trackAddShippingInfo({
      currency: 'CZK',
      value: goodsEstimate,
      value_is_estimate: true,
      shipping_tier: method.name,
      delivery_date: choice.date,
      items: checkoutItems(lines),
    })
    router.push(CHECKOUT_PATH)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-6">
        <Notices notices={notices} />
        <section className="card" aria-labelledby="cart-items-heading">
          <h2 id="cart-items-heading" className="mb-4 text-xl">
            Zboží v košíku
          </h2>
          {status === 'loading' ? (
            <p className="mb-3 text-sm text-muted" role="status">
              Ověřujeme aktuální ceny a dostupnost…
            </p>
          ) : null}
          <CartLines lines={lines} />
        </section>

        <section className="card scroll-mt-4" id="doprava" aria-labelledby="delivery-heading">
          <StepHeading id="delivery-heading" number={1}>
            Doprava a termín
          </StepHeading>
          <DeliveryPicker choice={choice} onChange={updateChoice} state={delivery.state} />
        </section>
      </div>

      <div className="lg:sticky lg:top-4">
        <OrderSummary
          goodsEstimate={goodsEstimate}
          delivery={method ? { name: method.name, price: method.price, type: method.type } : null}
          priceNotice={priceNotice}
        >
          {continueError ? (
            <p className="text-sm font-semibold text-brand-red" role="alert">
              {continueError}
            </p>
          ) : null}
          <button
            type="button"
            className="btn w-full"
            onClick={onContinue}
            data-testid="cart-continue"
          >
            Pokračovat k objednávce
          </button>
          <p className="text-center text-sm text-muted">
            Další krok: kontaktní údaje a{' '}
            {method?.type === 'pickup' ? 'potvrzení odběru' : 'adresa'}.
          </p>
        </OrderSummary>
      </div>
    </div>
  )
}
