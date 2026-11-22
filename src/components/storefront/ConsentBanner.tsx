'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import {
  getConsent,
  OPEN_CONSENT_EVENT,
  saveConsent,
  setConsentVersion,
} from '@/lib/consent/browser'

type Props = {
  /** Text version from Marketing → "Verze textu souhlasu s cookies". */
  version: string
  /** Page with details about cookies (when published). */
  cookiesHref: string | null
  privacyHref: string | null
}

/**
 * Cookie banner + preferences dialog (stage 6), design A.
 *
 * No dark patterns: "Odmítnout vše" and "Přijmout vše" are the same button style and size, side
 * by side; nothing non-essential is pre-ticked; closing is not consent (there is no close icon –
 * the visitor answers or keeps browsing with everything off). The banner does not block the page
 * (business rule 7: no interruptive pop-ups) and sits FIRST in the DOM, so keyboard and screen
 * reader users reach it right away. The dialog is a native <dialog> (focus trap, Esc).
 * Re-opened from the footer link "Nastavení soukromí" (`openConsentSettings()`).
 */
export function ConsentBanner({ version, cookiesHref, privacyHref }: Props) {
  const [ready, setReady] = useState(false)
  const [bannerOpen, setBannerOpen] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const dialogTitleId = useId()

  useEffect(() => {
    setConsentVersion(version)
    const stored = getConsent()
    /* eslint-disable react-hooks/set-state-in-effect -- reads the cookie once after hydration */
    setBannerOpen(stored === null)
    setAnalytics(stored?.analytics ?? false)
    setMarketing(stored?.marketing ?? false)
    setReady(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [version])

  const openDialog = useCallback(() => {
    const stored = getConsent()
    setAnalytics(stored?.analytics ?? false)
    setMarketing(stored?.marketing ?? false)
    dialogRef.current?.showModal()
  }, [])

  useEffect(() => {
    window.addEventListener(OPEN_CONSENT_EVENT, openDialog)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, openDialog)
  }, [openDialog])

  const decide = (choice: { analytics: boolean; marketing: boolean }) => {
    saveConsent(choice)
    setAnalytics(choice.analytics)
    setMarketing(choice.marketing)
    setBannerOpen(false)
    dialogRef.current?.close()
  }

  const links = (
    <>
      {cookiesHref ? (
        <Link href={cookiesHref} className="font-semibold text-brand-red underline">
          Více o cookies
        </Link>
      ) : null}
      {cookiesHref && privacyHref ? ' · ' : null}
      {privacyHref ? (
        <Link href={privacyHref} className="font-semibold text-brand-red underline">
          Zpracování osobních údajů
        </Link>
      ) : null}
    </>
  )

  return (
    <>
      {ready && bannerOpen ? (
        <section
          aria-labelledby={titleId}
          className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
          data-testid="consent-banner"
        >
          <div className="mx-auto max-w-4xl rounded-card border border-line bg-white p-4 shadow-[0_-4px_24px_rgba(54,35,24,0.18)] sm:p-5">
            <h2 id={titleId} className="font-slab text-lg font-semibold text-brand-brown">
              Cookies a měření
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink sm:text-[0.9375rem]">
              Nezbytné cookies potřebujeme, aby fungoval košík a objednávka. S vaším souhlasem
              použijeme i <strong>analytické</strong> (zjistíme, co na webu funguje) a{' '}
              <strong>marketingové</strong> (měření a cílení reklamy Google, Meta, Seznam, Heureka).
              Souhlas můžete kdykoli změnit v patičce webu. <span className="text-sm">{links}</span>
            </p>
            <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
              <button
                type="button"
                className="btn w-full"
                onClick={() => decide({ analytics: false, marketing: false })}
                data-testid="consent-reject"
              >
                Odmítnout vše
              </button>
              <button
                type="button"
                className="btn w-full"
                onClick={() => decide({ analytics: true, marketing: true })}
                data-testid="consent-accept"
              >
                Přijmout vše
              </button>
              <button
                type="button"
                className="btn btn-ghost col-span-2 w-full sm:col-span-1 sm:w-auto"
                onClick={openDialog}
                data-testid="consent-customize"
              >
                Nastavit
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <dialog
        ref={dialogRef}
        aria-labelledby={dialogTitleId}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-card bg-white p-0 text-ink backdrop:bg-black/50"
        data-testid="consent-dialog"
      >
        <form
          method="dialog"
          className="p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            decide({ analytics, marketing })
          }}
        >
          <h2 id={dialogTitleId} className="font-slab text-xl font-semibold text-brand-brown">
            Nastavení soukromí
          </h2>
          <p className="mt-2 text-[0.9375rem] text-muted">
            Vyberte, co nám dovolíte. Volbu uložíme na 6 měsíců do cookie v tomto prohlížeči a
            můžete ji kdykoli změnit.
          </p>
          <ul className="mt-4 space-y-3">
            <li className="rounded-card bg-brand-beige-light p-3.5">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked disabled className="mt-1 h-5 w-5 accent-brand-red" />
                <span>
                  <span className="font-semibold">Nezbytné</span>{' '}
                  <span className="text-sm text-muted">(vždy zapnuté)</span>
                  <span className="block text-sm text-muted">
                    Košík, průběh objednávky, ochrana formulářů a uložení této volby.
                  </span>
                </span>
              </label>
            </li>
            <li className="rounded-card bg-brand-beige-light p-3.5">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-brand-red"
                  data-testid="consent-analytics"
                />
                <span>
                  <span className="font-semibold">Analytické</span>
                  <span className="block text-sm text-muted">
                    Google Analytics 4: návštěvnost a nákupy. A náš vlastní záznam, odkud jste k nám
                    poprvé přišli (zdroj kampaně) – je uložený jen ve vašem prohlížeči a připojí se
                    k objednávce.
                  </span>
                </span>
              </label>
            </li>
            <li className="rounded-card bg-brand-beige-light p-3.5">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(event) => setMarketing(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-brand-red"
                  data-testid="consent-marketing"
                />
                <span>
                  <span className="font-semibold">Marketingové</span>
                  <span className="block text-sm text-muted">
                    Google Ads, Meta (Facebook, Instagram) včetně serverového předání nákupu,
                    Seznam/Zboží.cz a Heureka: měření úspěšnosti reklamy a zobrazování reklamy,
                    která vás může zajímat.
                  </span>
                </span>
              </label>
            </li>
          </ul>
          <p className="mt-3 text-sm">{links}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              className="btn w-full"
              onClick={() => decide({ analytics: false, marketing: false })}
            >
              Odmítnout vše
            </button>
            <button
              type="button"
              className="btn w-full"
              onClick={() => decide({ analytics: true, marketing: true })}
            >
              Přijmout vše
            </button>
            <button type="submit" className="btn btn-ghost w-full" data-testid="consent-save">
              Uložit výběr
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
