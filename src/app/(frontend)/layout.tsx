import type { Metadata } from 'next'
import React from 'react'

import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'),
  title: 'Terrys.cz – nový e-shop se připravuje',
  description: 'Prémiové maso a steaky z řeznictví Terrys. Nový e-shop se připravuje.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="bg-brand-beige font-sans text-brand-brown antialiased">{children}</body>
    </html>
  )
}
