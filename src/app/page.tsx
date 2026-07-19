import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import SectionStub from '@/components/SectionStub';
import Footer from '@/components/Footer';
import CookieBanner from '@/components/CookieBanner';

const STUBBED_SECTIONS = [
  { id: 'helyszin', i18nKey: 'sections.helyszin' },
  { id: 'csapat', i18nKey: 'sections.csapat' },
  { id: 'etlap', i18nKey: 'sections.etlap' },
  { id: 'borkultura', i18nKey: 'sections.borkultura' },
  { id: 'foglalas', i18nKey: 'sections.foglalas' },
  { id: 'kapcsolat', i18nKey: 'sections.kapcsolat' },
] as const;

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        {STUBBED_SECTIONS.map((section) => (
          <SectionStub key={section.id} id={section.id} i18nKey={section.i18nKey} />
        ))}
      </main>
      <Footer />
      <CookieBanner />
    </>
  );
}
