import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

/** Wraps a custom admin view in Payload's default template (sidebar, header) and a gutter. */
export function AdminPage({
  props,
  children,
}: {
  props: AdminViewServerProps
  children: React.ReactNode
}) {
  const { initPageResult, params, searchParams } = props
  const { req } = initPageResult
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter className="tf">{children}</Gutter>
    </DefaultTemplate>
  )
}

/** The order id from a view path like /admin/vazeni/123. */
export function idFromSegments(props: AdminViewServerProps): string | null {
  const segments = (props.params?.segments ?? []) as string[]
  const id = segments[1]
  return id && /^\d+$/.test(id) ? id : null
}

export function searchParam(props: AdminViewServerProps, name: string): string {
  const value = props.searchParams?.[name]
  return typeof value === 'string' ? value : Array.isArray(value) ? (value[0] ?? '') : ''
}
