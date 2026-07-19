import type { Metadata } from 'next';
import LegalShell from '@/components/LegalShell';
import { privacyContent } from '@/data/legal';

export const metadata: Metadata = {
  title: 'Adatvédelem — EPISTEME',
  robots: { index: false },
};

export default function PrivacyPage() {
  return <LegalShell titleKey="legal.privacyTitle" content={privacyContent} />;
}
