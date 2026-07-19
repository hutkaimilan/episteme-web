import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import './globals.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500'],
  variable: '--font-inter',
  display: 'swap',
});

const SITE_URL = 'https://episteme.example.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'EPISTEME — Fine Dining · Budapest',
  description:
    'Európa legexkluzívabb asztala Budapesten. A világ 0,01%-áért. Foglalás a Kossuth Lajos téren.',
  keywords: [
    'fine dining',
    'Budapest',
    'luxury restaurant',
    'EPISTEME',
    'Kossuth Lajos tér',
  ],
  openGraph: {
    type: 'website',
    siteName: 'EPISTEME',
    title: 'EPISTEME — Fine Dining · Budapest',
    description:
      'Európa legexkluzívabb asztala Budapesten. A világ 0,01%-áért. Foglalás a Kossuth Lajos téren.',
    locale: 'hu_HU',
    alternateLocale: ['en_US', 'es_ES'],
    images: [
      {
        url: '/images/brand/og-cover.jpg',
        width: 1200,
        height: 630,
        alt: 'EPISTEME — Fine Dining · Budapest',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EPISTEME — Fine Dining · Budapest',
    description:
      'Európa legexkluzívabb asztala Budapesten. A világ 0,01%-áért. Foglalás a Kossuth Lajos téren.',
    images: ['/images/brand/og-cover.jpg'],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0A0908',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hu" className="dark" suppressHydrationWarning>
      <body
        className={`${cormorant.variable} ${inter.variable} bg-obsidian font-sans text-ivory-muted antialiased`}
      >
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
