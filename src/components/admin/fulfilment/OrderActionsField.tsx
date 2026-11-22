'use client'

import { useAuth, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React from 'react'

import { StatusPill } from './StatusPill'

/** Sidebar of the standard order form: status badge + buttons to the fulfilment screens. */
export function OrderActionsField() {
  const { id } = useDocumentInfo()
  const { user } = useAuth<{ role?: string }>()
  const status = useFormFields(([fields]) => fields.status?.value as string | undefined)
  if (!id) return null
  const isEditor = user?.role === 'admin' || user?.role === 'staff'
  return (
    <div className="tf tf-side" style={{ paddingBottom: 0 }}>
      <StatusPill status={status} />
      {(status === 'received' || (isEditor && status === 'weighed')) && (
        <a className="tf-btn tf-btn--primary" href={`/admin/vazeni/${id}`}>
          Vážit
        </a>
      )}
      {isEditor && (
        <a className="tf-btn" href={`/admin/vyrizeni/${id}`} data-testid="open-fulfilment">
          Vyřídit objednávku
        </a>
      )}
    </div>
  )
}
