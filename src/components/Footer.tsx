'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/LanguageProvider';

/* lucide-react no longer ships brand icons, so Instagram is drawn inline */
function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export default function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-obsidian">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
        {/* Wordmark + tagline */}
        <div>
          <p className="font-display text-xl font-medium tracking-wide3 text-ivory">
            EPISTEME
          </p>
          <p className="mt-3 font-display text-base italic text-ivory-faint">
            {t('footer.tagline')}
          </p>
        </div>

        {/* Address + hours */}
        <div className="text-sm font-light leading-relaxed">
          <p className="mb-3 text-[0.6875rem] uppercase tracking-eyebrow text-gold">
            {t('footer.addressLabel')}
          </p>
          <p className="text-ivory-muted">{t('footer.address')}</p>
          <p className="mb-3 mt-6 text-[0.6875rem] uppercase tracking-eyebrow text-gold">
            {t('footer.hoursLabel')}
          </p>
          <p className="text-ivory-muted">{t('footer.hoursWeekdays')}</p>
          <p className="text-ivory-muted">{t('footer.hoursWeekend')}</p>
        </div>

        {/* Contact */}
        <div className="text-sm font-light leading-relaxed">
          <p className="mb-3 text-[0.6875rem] uppercase tracking-eyebrow text-gold">
            {t('footer.contactLabel')}
          </p>
          <a
            href="mailto:bizniszpappa@gmail.com"
            className="text-ivory-muted transition-colors duration-500 hover:text-gold-bright"
          >
            bizniszpappa@gmail.com
          </a>
          <div className="mt-6">
            <a
              href="#"
              aria-label={t('footer.instagramAria')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ivory-muted transition-all duration-500 ease-luxe hover:border-gold hover:text-gold"
            >
              <InstagramIcon size={16} />
            </a>
          </div>
        </div>

        {/* Legal */}
        <div className="text-sm font-light leading-relaxed">
          <p className="mb-3 text-[0.6875rem] uppercase tracking-eyebrow text-gold">
            {t('footer.legalLabel')}
          </p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/adatvedelem"
                className="text-ivory-muted transition-colors duration-500 hover:text-gold-bright"
              >
                {t('footer.privacy')}
              </Link>
            </li>
            <li>
              <Link
                href="/impresszum"
                className="text-ivory-muted transition-colors duration-500 hover:text-gold-bright"
              >
                {t('footer.imprint')}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs font-light text-ivory-faint sm:flex-row lg:px-10">
          <p>© {year} EPISTEME</p>
          <p className="font-display italic tracking-wide2">{t('footer.microline')}</p>
        </div>
      </div>
    </footer>
  );
}
