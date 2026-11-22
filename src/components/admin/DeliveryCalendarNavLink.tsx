'use client'

import { Link, NavGroup } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import React from 'react'

const HREF = '/admin/kalendar-doruceni'

/** Sidebar link to the custom view "Kalendář doručování" (after the collection groups). */
export function DeliveryCalendarNavLink() {
  const pathname = usePathname()
  const active = pathname === HREF
  return (
    <NavGroup label="Přehledy">
      <Link className="nav__link" href={HREF} id="nav-kalendar-doruceni" prefetch={false}>
        {active && <div className="nav__link-indicator" />}
        <span className="nav__link-label">Kalendář doručování</span>
      </Link>
    </NavGroup>
  )
}
