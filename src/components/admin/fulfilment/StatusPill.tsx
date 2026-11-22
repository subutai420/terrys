import React from 'react'

import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders/constants'
import type { ShippingMethodType } from '@/lib/delivery/constants'

/** Coloured status badge (styles in custom.scss, theme-aware). Works in server and client. */
export function StatusPill({ status }: { status: string | null | undefined }) {
  const value = (status ?? 'received') as OrderStatus
  return (
    <span className={`tf-pill tf-pill--${value}`} data-testid="status-pill" data-status={value}>
      {ORDER_STATUS_LABELS[value] ?? value}
    </span>
  )
}

export const METHOD_SHORT: Record<ShippingMethodType, string> = {
  'own-delivery': 'Rozvoz',
  courier: 'Kurýr',
  pickup: 'Odběr',
}

export function TypePill({ type }: { type: string | null | undefined }) {
  if (!type) return null
  return (
    <span className="tf-pill tf-pill--type">
      {METHOD_SHORT[type as ShippingMethodType] ?? type}
    </span>
  )
}
