'use client'

import { Link, NavGroup, useAuth } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import React from 'react'

const HREF = '/admin/osobni-udaje'

/** Stage 9: sidebar link to "Osobní údaje (GDPR)" – shown to administrators only. */
export function PrivacyNavLink() {
  const pathname = usePathname()
  const { user } = useAuth<{ role?: string | null }>()
  if (user?.role !== 'admin') return null
  return (
    <NavGroup label="Ochrana údajů">
      <Link className="nav__link" href={HREF} id="nav-osobni-udaje" prefetch={false}>
        {pathname === HREF && <div className="nav__link-indicator" />}
        <span className="nav__link-label">Osobní údaje (GDPR)</span>
      </Link>
    </NavGroup>
  )
}
