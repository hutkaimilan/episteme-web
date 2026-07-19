import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import LocationGallery from '@/components/LocationGallery';
import TeamSection from '@/components/TeamSection';
import MenuSection from '@/components/MenuSection';
import WineCultureSection from '@/components/WineCultureSection';
import ReservationSection from '@/components/ReservationSection';
import ContactSection from '@/components/ContactSection';
import Footer from '@/components/Footer';
import CookieBanner from '@/components/CookieBanner';

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
        <ContactSection />
      </main>
      <Footer />
      <CookieBanner />
    </>
  );
}
