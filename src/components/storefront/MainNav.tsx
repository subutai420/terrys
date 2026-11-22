'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

export type NavLink = { title: string; href: string }
export type NavData = {
  /** Mega menu columns: by meat type, by cut, by origin. */
  columns: { key: string; label: string; items: NavLink[] }[]
  /** Standalone items (with their subcategories). */
  standalone: (NavLink & { children: NavLink[] })[]
  /** Quick category links shown directly in the bar (desktop). */
  quick: NavLink[]
  /** Content links on the right (magazine, recipes, stores). */
  content: NavLink[]
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/** Desktop: brown bar with the "Sortiment" mega menu. Mobile: menu button with accordions. */
export function MainNav({ nav }: { nav: NavData }) {
  const pathname = usePathname()
  const [megaOpen, setMegaOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const megaId = useId()
  const mobileId = useId()
  const megaRef = useRef<HTMLLIElement>(null)
  const megaButton = useRef<HTMLButtonElement>(null)

  // Close menus after navigation (state adjusted during render, as React recommends).
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setMegaOpen(false)
    setMobileOpen(false)
  }

  // Escape closes, click outside closes the mega menu.
  useEffect(() => {
    if (!megaOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMegaOpen(false)
        megaButton.current?.focus()
      }
    }
    const onClick = (event: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(event.target as Node)) setMegaOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [megaOpen])

  const isCurrent = (href: string) => pathname === href

  const hasCategories = nav.columns.length > 0 || nav.standalone.length > 0

  return (
    <nav aria-label="Hlavní menu" className="relative bg-brand-brown">
      {/* ---------------------------------------------------------------- mobile */}
      <div className="wrap flex items-center justify-between lg:hidden">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={mobileId}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex min-h-12 items-center gap-2 font-semibold text-[#f1e9df]"
          data-testid="mobile-menu-button"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            {mobileOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          {mobileOpen ? 'Zavřít menu' : 'Sortiment a menu'}
        </button>
      </div>
      <div
        id={mobileId}
        hidden={!mobileOpen}
        className="border-t border-brand-brown-light bg-white lg:hidden"
      >
        <div className="wrap py-2">
          {nav.columns.map((column) => (
            <details key={column.key} className="group border-b border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-slab font-semibold text-brand-brown [&::-webkit-details-marker]:hidden">
                {column.label}
                <span className="transition-transform group-open:rotate-180">
                  <Chevron open={false} />
                </span>
              </summary>
              <ul className="pb-3 pl-3">
                {column.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block py-2"
                      aria-current={isCurrent(item.href) ? 'page' : undefined}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {nav.standalone.map((item) =>
            item.children.length > 0 ? (
              <details key={item.href} className="group border-b border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-slab font-semibold text-brand-brown [&::-webkit-details-marker]:hidden">
                  {item.title}
                  <span className="transition-transform group-open:rotate-180">
                    <Chevron open={false} />
                  </span>
                </summary>
                <ul className="pb-3 pl-3">
                  <li>
                    <Link href={item.href} className="block py-2 font-semibold">
                      Vše z kategorie {item.title}
                    </Link>
                  </li>
                  {item.children.map((child) => (
                    <li key={child.href}>
                      <Link href={child.href} className="block py-2">
                        {child.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-12 items-center border-b border-line font-slab font-semibold text-brand-brown"
              >
                {item.title}
              </Link>
            ),
          )}
          <ul className="py-2">
            {nav.content.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex min-h-11 items-center font-semibold text-brand-red"
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ---------------------------------------------------------------- desktop */}
      <ul className="wrap hidden items-stretch gap-1 lg:flex">
        {hasCategories ? (
          <li ref={megaRef} className="static">
            <button
              ref={megaButton}
              type="button"
              aria-expanded={megaOpen}
              aria-controls={megaId}
              onClick={() => setMegaOpen((open) => !open)}
              className={`flex h-full items-center gap-2 px-3.5 py-3.5 text-[0.9375rem] font-semibold whitespace-nowrap text-[#f1e9df] hover:bg-brand-brown-light hover:text-white ${megaOpen ? 'bg-brand-brown-light text-white' : ''}`}
              data-testid="mega-menu-button"
            >
              Sortiment
              <Chevron open={megaOpen} />
            </button>
            <div
              id={megaId}
              hidden={!megaOpen}
              data-testid="mega-menu-panel"
              className="absolute inset-x-0 top-full z-40 border-t-4 border-brand-gold-dark bg-white shadow-[0_18px_40px_rgba(43,26,17,0.18)]"
            >
              <div className="wrap grid grid-cols-4 gap-8 py-7">
                {nav.columns.map((column) => (
                  <div key={column.key}>
                    <h2 className="mb-3 border-b-2 border-brand-beige pb-1.5 text-[1.0625rem] font-semibold">
                      {column.label}
                    </h2>
                    <ul className="space-y-0.5 text-[0.9375rem]">
                      {column.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="block rounded px-2 py-1.5 hover:bg-brand-beige-light"
                            aria-current={isCurrent(item.href) ? 'page' : undefined}
                          >
                            {item.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {nav.standalone.length > 0 ? (
                  <div className={nav.columns.length === 0 ? 'col-span-4 columns-4 gap-8' : ''}>
                    {nav.columns.length > 0 ? (
                      <h2 className="mb-3 border-b-2 border-brand-beige pb-1.5 text-[1.0625rem] font-semibold">
                        Další sortiment
                      </h2>
                    ) : null}
                    <ul className="space-y-0.5 text-[0.9375rem]">
                      {nav.standalone.map((item) => (
                        <li key={item.href} className="break-inside-avoid pb-2">
                          <Link
                            href={item.href}
                            className="block rounded px-2 py-1.5 font-semibold hover:bg-brand-beige-light"
                          >
                            {item.title}
                          </Link>
                          {item.children.length > 0 ? (
                            <ul className="ml-2 border-l border-line pl-2 text-sm">
                              {item.children.map((child) => (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className="block rounded px-2 py-1 hover:bg-brand-beige-light"
                                  >
                                    {child.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        ) : null}
        {nav.quick.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isCurrent(link.href) ? 'page' : undefined}
              className="block px-3.5 py-3.5 text-[0.9375rem] font-semibold whitespace-nowrap text-[#f1e9df] hover:bg-brand-brown-light hover:text-white aria-[current=page]:bg-brand-brown-light aria-[current=page]:text-white"
            >
              {link.title}
            </Link>
          </li>
        ))}
        <li className="flex-1" aria-hidden="true" />
        {nav.content.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isCurrent(link.href) ? 'page' : undefined}
              className="block px-3.5 py-3.5 text-[0.9375rem] font-semibold whitespace-nowrap text-[#f1e9df] hover:bg-brand-brown-light hover:text-white aria-[current=page]:bg-brand-brown-light aria-[current=page]:text-white"
            >
              {link.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
