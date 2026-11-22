'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { trackAddShippingInfo, trackViewCart } from '@/lib/analytics'
import {
  type DeliveryChoice,
  readDeliveryChoice,
  saveDeliveryChoice,
} from '@/lib/cart/checkoutState'
import { getCartStore } from '@/lib/cart/store'
import { CHECKOUT_PATH } from '@/lib/orders/constants'
import {
  cartKind,
  isElectronicVoucherLine,
  MIXED_CART_MESSAGE,
  PRINTED_VARIANT_ID,
} from '@/lib/vouchers/cart'
import { VOUCHER_FORMAT_LABELS } from '@/lib/vouchers/constants'

import { CartLines } from './CartLines'
import { DeliveryPicker } from './DeliveryPicker'
import { Notices, StepHeading } from './parts'
import { lineTotal, useDeliveryOptions, useValidatedCart } from './hooks'
import { OrderSummary } from './OrderSummary'

type Props = { priceNotice: string; deliveryInfoHref: string | null }

/**
 * Cart page (stage 4): lines (re-validated against the server on load) → step 1 postcode,
 * delivery method and date → summary → "Pokračovat k objednávce" (checkout page).
 */
export function CartView({ priceNotice, deliveryInfoHref }: Props) {
  const router = useRouter()
  const { lines, hydrated, status, notices, vouchers, revalidate } = useValidatedCart()
  // Read once in the browser; nothing is rendered from it before hydration (see below).
  const [choice, setChoice] = useState<DeliveryChoice>(() => readDeliveryChoice())
  const [continueError, setContinueError] = useState<string | null>(null)
  const delivery = useDeliveryOptions(choice.postcode)
  const viewCartSent = useRef(false)

  // view_cart once per visit of the page, after the server re-validated the cart.
  useEffect(() => {
    if (viewCartSent.current || !hydrated || status === 'loading' || lines.length === 0) return
    viewCartSent.current = true
    trackViewCart(lines)
  }, [hydrated, status, lines])

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
  // Stage 7: electronic vouchers only → no delivery step; mixed with goods → not allowed.
  const kind = cartKind(lines)
  if (kind === 'electronic-vouchers' || kind === 'mixed-electronic') {
    const unavailable = vouchers !== null && !vouchers.electronic
    const switchToPrinted = () => {
      const store = getCartStore()
      for (const line of store.getLines().filter(isElectronicVoucherLine)) {
        store.remove(line.productId, line.variantId)
        store.add({
          ...line,
          variantId: PRINTED_VARIANT_ID,
          variantLabel: VOUCHER_FORMAT_LABELS.printed,
        })
      }
      void revalidate()
    }
    const blocked = kind === 'mixed-electronic' || unavailable
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-6">
          <Notices notices={notices} />
          {blocked ? (
            <div
              className="card border-2 border-brand-red"
              role="alert"
              data-testid="voucher-cart-blocked"
            >
              <p className="font-semibold">
                {kind === 'mixed-electronic'
                  ? MIXED_CART_MESSAGE
                  : 'Elektronické poukazy teď bohužel nejde objednat online. Můžete koupit tištěný poukaz (přibalíme ho k zásilce nebo k vyzvednutí), nebo nám zavolejte.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn"
                  onClick={switchToPrinted}
                  data-testid="voucher-switch-printed"
                >
                  Změnit na tištěný poukaz
                </button>
              </div>
            </div>
          ) : null}
          <section className="card" aria-labelledby="cart-items-heading">
            <h2 id="cart-items-heading" className="mb-4 text-xl">
              {kind === 'electronic-vouchers' ? 'Dárkové poukazy v košíku' : 'Zboží v košíku'}
            </h2>
            {status === 'loading' ? (
              <p className="mb-3 text-sm text-muted" role="status">
                Ověřujeme aktuální ceny a dostupnost…
              </p>
            ) : null}
            <CartLines lines={lines} />
          </section>
          {kind === 'electronic-vouchers' ? (
            <section
              className="card"
              aria-labelledby="voucher-delivery-heading"
              data-testid="voucher-no-delivery"
            >
              <h2 id="voucher-delivery-heading" className="mb-2 text-xl">
                Doručení a platba
              </h2>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <strong>Bez dopravy a bez čekání:</strong> poukaz v PDF vám přijde e-mailem hned
                  po odeslání objednávky. Můžete ho vytisknout nebo přeposlat.
                </li>
                <li>
                  <strong>Platba převodem</strong> do {vouchers?.dueHours ?? 72} hodin – v e-mailu
                  najdete QR kód a platební údaje.
                </li>
                <li>Poukaz začne platit, jakmile nám dorazí platba.</li>
              </ul>
            </section>
          ) : null}
        </div>
        <div className="lg:sticky lg:top-4">
          <OrderSummary
            goodsEstimate={goodsEstimate}
            delivery={null}
            priceNotice={priceNotice}
            variant="vouchers"
            dueHours={vouchers?.dueHours ?? 72}
          >
            <button
              type="button"
              className="btn w-full"
              disabled={blocked}
              onClick={() => router.push(CHECKOUT_PATH)}
              data-testid="cart-continue"
            >
              Pokračovat k objednávce
            </button>
            <p className="text-center text-sm text-muted">Další krok: kontaktní údaje.</p>
          </OrderSummary>
        </div>
      </div>
    )
  }
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
    trackAddShippingInfo(lines, method.name, choice.date)
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
