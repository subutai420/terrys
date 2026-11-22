'use client'

import { Link, NavGroup, useAuth } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import React from 'react'

const LINKS = [
  { href: '/admin/poukazy-platby', label: 'Poukazy – platby', id: 'nav-voucher-payments' },
  { href: '/admin/collections/vouchers', label: 'Dárkové poukazy', id: 'nav-vouchers' },
  { href: '/admin/collections/voucher-batches', label: 'Šarže poukazů', id: 'nav-voucher-batches' },
]

/**
 * Sidebar group "Poukazy" (stage 7), same pattern as "Objednávky": the voucher collections have
 * `admin.group: false` and are listed here next to the custom view "Poukazy – platby".
 * Only admin and staff (the butcher has no access to vouchers).
 */
export function VouchersNavGroup() {
  const pathname = usePathname() ?? ''
  const { user } = useAuth<{ role?: string }>()
  if (user?.role !== 'admin' && user?.role !== 'staff') return null
  return (
    <NavGroup label="Poukazy">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            className="nav__link"
            href={link.href}
            id={link.id}
            key={link.href}
            prefetch={false}
          >
            {active && <div className="nav__link-indicator" />}
            <span className="nav__link-label">{link.label}</span>
          </Link>
        )
      })}
    </NavGroup>
  )
}
