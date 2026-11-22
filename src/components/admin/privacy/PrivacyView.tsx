import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { isAdminUser } from '@/access'

import { PrivacyTool } from './PrivacyTool'

/**
 * Stage 9: admin view "Osobní údaje (GDPR)" at /admin/osobni-udaje – export of everything held
 * about an e-mail address and anonymisation (on request or after the retention period).
 * Admin only; the endpoints check the role again (src/privacy/endpoints.ts).
 */
export async function PrivacyView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const allowed = isAdminUser(req.user as { role?: string | null } | null)
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
      <Gutter>
        <h1 style={{ marginTop: '1.5rem' }}>Osobní údaje (GDPR)</h1>
        {allowed ? <PrivacyTool /> : <p>Tato stránka je jen pro administrátora.</p>}
      </Gutter>
    </DefaultTemplate>
  )
}
