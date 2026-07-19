import type { Metadata } from 'next';
import LegalShell from '@/components/LegalShell';
import { imprintContent } from '@/data/legal';

export const metadata: Metadata = {
  title: 'Impresszum — EPISTEME',
  robots: { index: false },
};

export default function ImprintPage() {
  return <LegalShell titleKey="legal.imprintTitle" content={imprintContent} />;
}
