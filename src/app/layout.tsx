import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import ScrollProgress from '@/components/ScrollProgress';
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

// The host this actually runs on. While it said example.com, metadataBase
// made every absolute URL — the OG image included — point at a domain that
// does not exist, so a shared link previewed with no image.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://epistemebudapest.up.railway.app';

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
  // EPISTEME is an invented restaurant. Indexed, search would offer it as a
  // real Budapest address and people would try to book a table that does not
  // exist. Restaurant JSON-LD is left off for the same reason: structured data
  // would feed a knowledge panel for a business nobody can visit.
  robots: { index: false, follow: false },
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
        <ScrollProgress />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
