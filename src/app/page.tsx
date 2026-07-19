import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import LocationGallery from '@/components/LocationGallery';
import TeamSection from '@/components/TeamSection';
import MenuSection from '@/components/MenuSection';
import WineCultureSection from '@/components/WineCultureSection';
import ReservationSection from '@/components/ReservationSection';
import SectionStub from '@/components/SectionStub';
import Footer from '@/components/Footer';
import CookieBanner from '@/components/CookieBanner';

const STUBBED_SECTIONS = [
  { id: 'kapcsolat', i18nKey: 'sections.kapcsolat' },
] as const;

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <LocationGallery />
        <TeamSection />
        <MenuSection />
        <WineCultureSection />
        <ReservationSection />
        {STUBBED_SECTIONS.map((section) => (
          <SectionStub key={section.id} id={section.id} i18nKey={section.i18nKey} />
        ))}
      </main>
      <Footer />
      <CookieBanner />
    </>
  );
}
