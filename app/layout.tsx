import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#030704' }

export const metadata: Metadata = {
  title: 'ROGUE Markets — Godmode Terminal',
  description: 'Evidence-first market intelligence and non-custodial launch workspace.',
  applicationName: 'ROGUE Markets',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: 'ROGUE Markets', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
}
export default function RootLayout({children}:{children:ReactNode}){
 return <html lang="en"><head><meta name="mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-capable" content="yes"/></head><body>{children}</body></html>
}
