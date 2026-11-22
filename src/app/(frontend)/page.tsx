/**
 * Temporary placeholder homepage (Stage 0).
 * Will be replaced by the real storefront once the design variant is chosen.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="mb-4 text-sm font-semibold tracking-widest text-brand-gold-dark uppercase">
        Řeznictví Terrys
      </p>
      <h1 className="text-4xl font-bold text-brand-red sm:text-5xl">Terrys.cz</h1>
      <p className="mt-6 max-w-xl text-lg">
        Nový e-shop se připravuje. Brzy u nás objednáte prémiové maso a steaky až domů.
      </p>
      <div className="mt-10 h-1 w-24 rounded bg-brand-gold" aria-hidden="true" />
    </main>
  )
}
