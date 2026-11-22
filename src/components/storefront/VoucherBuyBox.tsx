'use client'

import Link from 'next/link'
import { useEffect, useId, useState } from 'react'

import type { CartProductInfo } from '@/lib/cart/line'
import type { AddToCartInput } from '@/lib/cart/store'
import { formatCzk } from '@/lib/format'
import { VOUCHER_FORMAT_LABELS, type VoucherFormat } from '@/lib/vouchers/constants'

import { AddToCartButton } from './AddToCartButton'

type Choice = { id: number; value: number; url: string; current: boolean }

type Props = {
  product: CartProductInfo
  formats: VoucherFormat[]
  values: Choice[]
  /** Human date "31. 12. 2027" of the active batch, or null. */
  validUntil: string | null
  deliveryPrice: number
  dueHours: number
  soldOut: boolean
}

const FORMAT_INFO: Record<VoucherFormat, { title: string; lines: (p: Props) => string[] }> = {
  electronic: {
    title: 'Elektronický – PDF e-mailem',
    lines: (p) => [
      'Poukaz v PDF vám přijde e-mailem hned po objednávce – ideální na poslední chvíli.',
      `Platíte převodem do ${p.dueHours} hodin (QR kód v e-mailu). Poukaz platí od přijetí platby.`,
      'Bez dopravy. Nelze kombinovat s masem v jedné objednávce.',
    ],
  },
  printed: {
    title: 'Tištěný – v dárkovém provedení',
    lines: (p) => [
      `Přibalíme ho k vaší objednávce masa (doprava ${formatCzk(p.deliveryPrice)}), nebo si ho vyzvednete zdarma na prodejně či výdejním místě.`,
      'Platíte při převzetí, stejně jako maso.',
    ],
  },
}

/**
 * Stage 7: buy box of a gift voucher product (design A): value chips (links to the other voucher
 * products), electronic vs. printed with an explanation of payment and delivery, fixed price
 * (no "≈" – a voucher is not weighed), validity of the active batch.
 */
export function VoucherBuyBox(props: Props) {
  const { product, formats, values, validUntil, soldOut } = props
  const [format, setFormat] = useState<VoucherFormat>(formats[0] ?? 'electronic')
  // Feeds / links may preselect the format with ?varianta=printed.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('varianta')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off sync with the URL
    if (wanted && formats.includes(wanted as VoucherFormat)) setFormat(wanted as VoucherFormat)
  }, [formats])
  const name = useId()

  const line: AddToCartInput | null = soldOut
    ? null
    : {
        productId: product.id,
        variantId: format,
        title: product.title,
        variantLabel: VOUCHER_FORMAT_LABELS[format],
        unitPrice: product.price,
        priceUnit: 'piece',
        weightGrams: null,
        estimatedPrice: Math.round(product.price),
        url: product.url,
        imageUrl: product.imageUrl,
        ...(product.analytics ? { analytics: product.analytics } : {}),
      }

  return (
    <div data-testid="voucher-buybox">
      {values.length > 1 ? (
        <div className="mt-5">
          <p className="mb-2.5 font-slab text-[1.0625rem] font-semibold text-brand-brown">
            Hodnota poukazu
          </p>
          <ul className="flex flex-wrap gap-2" data-testid="voucher-values">
            {values.map((choice) => (
              <li key={choice.id}>
                <Link
                  href={choice.url}
                  aria-current={choice.current ? 'page' : undefined}
                  className={`flex min-h-[2.625rem] items-center rounded-card border px-3.5 py-2 text-[0.9375rem] font-semibold transition-colors ${
                    choice.current
                      ? 'border-brand-brown bg-brand-brown text-white'
                      : 'border-line bg-white hover:border-brand-brown'
                  }`}
                >
                  {formatCzk(choice.value)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="mt-5">
        <legend className="mb-2.5 font-slab text-[1.0625rem] font-semibold text-brand-brown">
          Jak poukaz chcete?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {formats.map((item) => {
            const id = `${name}-${item}`
            return (
              <div key={item}>
                <input
                  type="radio"
                  id={id}
                  name={name}
                  value={item}
                  checked={format === item}
                  onChange={() => setFormat(item)}
                  className="peer sr-only"
                  data-testid={`voucher-format-${item}`}
                />
                <label
                  htmlFor={id}
                  className="flex h-full min-h-[2.625rem] cursor-pointer flex-col rounded-card border border-line bg-white px-3.5 py-2.5 transition-colors hover:border-brand-brown peer-checked:border-brand-brown peer-checked:bg-brand-brown peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-gold-dark"
                >
                  <span className="font-semibold">{FORMAT_INFO[item].title}</span>
                </label>
              </div>
            )
          })}
        </div>
        <ul
          className="mt-3 list-disc space-y-1 pl-5 text-[0.9375rem]"
          data-testid="voucher-format-info"
        >
          {FORMAT_INFO[format].lines(props).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-card bg-brand-beige-light p-4">
        <div>
          <small className="block text-sm text-muted">Cena poukazu</small>
          <span
            className="block font-slab text-[1.875rem] leading-tight font-bold text-brand-red"
            data-testid="price-estimate"
          >
            {formatCzk(product.price)}
          </span>
          {validUntil ? (
            <small className="block text-sm text-muted" data-testid="voucher-validity">
              Platnost do {validUntil}
            </small>
          ) : null}
        </div>
        <AddToCartButton
          line={line}
          label="Přidat do košíku"
          className="w-full sm:w-auto"
          disabledLabel="Teď nelze koupit"
        />
      </div>
    </div>
  )
}
