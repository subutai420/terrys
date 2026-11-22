'use client'

import { useEffect, useId, useState } from 'react'

import { type CartProductInfo, lineForSingle, lineForVariant } from '@/lib/cart/line'
import { formatCzk } from '@/lib/format'
import { formatWeight, PRICE_UNIT_SHORT, type VariantOption } from '@/lib/productView'

import { AddToCartButton } from './AddToCartButton'

type Props = {
  product: CartProductInfo
  options: VariantOption[]
  defaultIndex: number
  mode: 'variants' | 'single' | 'none'
  weightPriced: boolean
  priceNotice: string
  soldOut: boolean
}

/**
 * Variant picker with the live ESTIMATED price (business rule 4), the ±15 % range and the add to
 * cart button. Variants are native radio buttons (keyboard and screen readers work out of the box).
 */
export function BuyBox({
  product,
  options,
  defaultIndex,
  mode,
  weightPriced,
  priceNotice,
  soldOut,
}: Props) {
  const [selected, setSelected] = useState(defaultIndex)
  // Stage 6: feeds and ads link to `?varianta=<variant id>` – preselect that variant so the page
  // shows exactly the advertised price. Read after hydration (the page itself is cached / ISR).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('varianta')
    if (!wanted) return
    const match = options.find((item) => item.id === wanted)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off sync with the URL
    if (match) setSelected(match.index)
  }, [options])
  const name = useId()
  const option = options[selected]
  const unit = PRICE_UNIT_SHORT[product.priceUnit]

  const line =
    mode === 'variants' && option
      ? lineForVariant(product, option)
      : mode === 'single'
        ? lineForSingle(product)
        : null

  const estimate = mode === 'single' ? Math.round(product.price) : (option?.estimate ?? null)

  return (
    <div>
      {options.length > 0 ? (
        <fieldset className="mt-5">
          <legend className="mb-2.5 font-slab text-[1.0625rem] font-semibold text-brand-brown">
            {weightPriced ? 'Kolik masa chcete?' : 'Vyberte variantu'}
          </legend>
          <div className="flex flex-wrap gap-2">
            {options.map((item) => {
              const id = `${name}-${item.index}`
              return (
                <div key={id}>
                  <input
                    type="radio"
                    id={id}
                    name={name}
                    value={item.index}
                    checked={selected === item.index}
                    onChange={() => setSelected(item.index)}
                    className="peer sr-only"
                    data-testid="variant-option"
                  />
                  <label
                    htmlFor={id}
                    className={`flex min-h-[2.625rem] cursor-pointer items-center rounded-card border px-3.5 py-2 text-[0.9375rem] font-semibold transition-colors peer-checked:border-brand-brown peer-checked:bg-brand-brown peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-gold-dark ${
                      item.purchasable
                        ? 'border-line bg-white hover:border-brand-brown'
                        : 'border-dashed border-line bg-brand-beige-light text-muted line-through'
                    }`}
                  >
                    {item.label}
                    {!item.purchasable ? <span className="sr-only"> (nedostupné)</span> : null}
                  </label>
                </div>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-card bg-brand-beige-light p-4">
        <div aria-live="polite" data-testid="price-estimate-box">
          {estimate !== null ? (
            <>
              <small className="block text-sm text-muted">
                {weightPriced ? (
                  <>
                    {formatCzk(product.price)} / {unit}
                    {option?.weightGrams
                      ? `, odhad za ${formatWeight(option.weightGrams)}`
                      : ', odhad'}
                  </>
                ) : (
                  'Cena'
                )}
              </small>
              <span
                className="block font-slab text-[1.875rem] leading-tight font-bold text-brand-red"
                data-testid="price-estimate"
              >
                {weightPriced ? '≈ ' : ''}
                {formatCzk(estimate)}
              </span>
              {weightPriced && option?.range ? (
                <small className="block text-sm text-muted">
                  Řezník zváží, obvykle {formatCzk(option.range.low)} až{' '}
                  {formatCzk(option.range.high)}
                </small>
              ) : null}
            </>
          ) : (
            <span className="block font-slab text-2xl font-bold text-brand-red">
              {formatCzk(product.price)}{' '}
              <small className="font-sans text-sm text-muted">/ {unit}</small>
            </span>
          )}
        </div>
        {line ? (
          <AddToCartButton line={line} label="Přidat do košíku" className="w-full sm:w-auto" />
        ) : (
          <AddToCartButton
            line={null}
            className="w-full sm:w-auto"
            disabledLabel={soldOut ? 'Vyprodáno' : 'Nelze objednat online'}
          />
        )}
      </div>
      {weightPriced && estimate !== null ? (
        <p className="mt-3 text-sm text-muted" data-testid="price-notice">
          {priceNotice}
        </p>
      ) : null}
      {mode === 'none' && !soldOut ? (
        <p className="mt-3 text-sm text-muted">
          Tento produkt zatím nemá zadané velikosti balení, a proto ho nelze objednat přes e-shop.
        </p>
      ) : null}
    </div>
  )
}
