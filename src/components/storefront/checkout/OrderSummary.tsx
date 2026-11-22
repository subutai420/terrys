import type { ReactNode } from 'react'

import { formatCzk } from '@/lib/format'
import { WEIGHT_TOLERANCE } from '@/lib/productView'

type Props = {
  goodsEstimate: number
  /** null = no method chosen yet. */
  delivery: { name: string; price: number; type: string } | null
  priceNotice: string
  children?: ReactNode
  heading?: string
}

const percent = Math.round(WEIGHT_TOLERANCE * 100)

/** Estimated totals with the ±15 % / pay-on-delivery notice (business rules 2–4). */
export function OrderSummary({
  goodsEstimate,
  delivery,
  priceNotice,
  children,
  heading = 'Souhrn',
}: Props) {
  const total = goodsEstimate + (delivery?.price ?? 0)
  return (
    <section
      className="card h-fit space-y-3"
      aria-labelledby="summary-heading"
      data-testid="order-summary"
    >
      <h2 id="summary-heading" className="text-xl">
        {heading}
      </h2>
      <dl className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <dt>Odhad za zboží</dt>
          <dd className="font-semibold" data-testid="summary-goods">
            ≈ {formatCzk(goodsEstimate)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{delivery ? delivery.name : 'Doprava'}</dt>
          <dd className="text-right font-semibold" data-testid="summary-delivery">
            {delivery ? (
              delivery.price > 0 ? (
                formatCzk(delivery.price)
              ) : (
                <span className="text-ok">zdarma</span>
              )
            ) : (
              <span className="font-normal text-muted">podle zvolené dopravy</span>
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
      <div className="rounded-card bg-brand-beige-light p-3 text-sm" data-testid="estimate-notice">
        <p>
          <strong>Ceny jsou odhad.</strong> {priceNotice}
          {priceNotice.includes(`${percent}`)
            ? null
            : ` Zaplatíte podle skutečné hmotnosti, obvykle se cena liší do ±${percent} %.`}
        </p>
        <p className="mt-2">
          <strong>Platíte až při převzetí</strong>, hotově nebo kartou. Online platba není potřeba.
        </p>
      </div>
      {children}
    </section>
  )
}
