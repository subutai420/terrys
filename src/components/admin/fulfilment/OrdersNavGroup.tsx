'use client'

import { Link, NavGroup, useAuth } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import React from 'react'

const LINKS = [
  { href: '/admin/expedice', label: 'Expedice', id: 'nav-expedice', editorsOnly: false },
  { href: '/admin/collections/orders', label: 'Objednávky', id: 'nav-orders', editorsOnly: false },
  {
    href: '/admin/collections/withdrawals',
    label: 'Odstoupení od smlouvy',
    id: 'nav-withdrawals',
    editorsOnly: false,
  },
  {
    href: '/admin/collections/order-audit-log',
    label: 'Historie změn',
    id: 'nav-order-audit-log',
    editorsOnly: true,
  },
]

/**
 * Sidebar group "Objednávky" (stage 5). Payload cannot add a custom view into a generated
 * collection group, so the order collections are hidden from the generated nav
 * (`admin.group: false`) and listed here together with the custom view "Expedice".
 */
export function OrdersNavGroup() {
  const pathname = usePathname() ?? ''
  const { user } = useAuth<{ role?: string }>()
  const isEditor = user?.role === 'admin' || user?.role === 'staff'
  return (
    <NavGroup label="Objednávky">
      {LINKS.filter((link) => isEditor || !link.editorsOnly).map((link) => {
        const active =
          pathname === link.href ||
          pathname.startsWith(`${link.href}/`) ||
          (link.href === '/admin/expedice' && /^\/admin\/(vazeni|vyrizeni)\//.test(pathname))
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
