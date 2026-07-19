'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { locationImages, type LocationImage } from '@/data/locations';
import { useI18n } from '@/i18n/LanguageProvider';
import { cn, parseItalics } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

/*
 * Asymmetric bento composition on a 12-column grid, two mirrored bands whose
 * vertical gutters intentionally do not align (8/4 above, 5/7 below):
 *
 *   ┌────────────────┬────────┐
 *   │                │ fő-terem│
 *   │   homlokzat    ├────────┤
 *   │                │ rooftop │
 *   ├──────────┬─────┴────────┤
 *   │ díszasztal│              │
 *   ├──────────┤ rooftop-ter. │
 *   │  terasz   │              │
 *   └──────────┴──────────────┘
 */
const GRID_CLASSES: Record<string, string> = {
  homlokzat: 'lg:col-span-8 lg:row-span-4',
  'fo-terem': 'lg:col-span-4 lg:row-span-2',
  'rooftop-bar': 'lg:col-span-4 lg:row-span-2',
  diszasztal: 'lg:col-span-5 lg:row-span-2',
  'rooftop-terasz': 'lg:col-span-7 lg:row-span-4',
  terasz: 'lg:col-span-5 lg:row-span-2',
};

const SIZES_ATTR: Record<LocationImage['size'], string> = {
  large: '(min-width: 1024px) 66vw, 100vw',
  medium: '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
  small: '(min-width: 1024px) 42vw, (min-width: 640px) 50vw, 100vw',
};

/** Parallax drift per size — subtle, disabled under reduced motion. */
const DRIFT: Record<LocationImage['size'], number> = {
  large: 26,
  medium: 20,
  small: 15,
};

function ItalicTitle({ copy }: { copy: string }) {
  return (
    <>
      {parseItalics(copy).map((segment, i) =>
        segment.italic ? (
          <em key={i} className="font-normal italic text-gold-bright">
            {segment.text}
          </em>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function GalleryItem({
  item,
  onOpen,
  registerTrigger,
}: {
  item: LocationImage;
  onOpen: () => void;
  registerTrigger: (el: HTMLButtonElement | null) => void;
}) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  const drift = DRIFT[item.size];
  const y = useTransform(scrollYProgress, [0, 1], [drift, -drift]);

  return (
    <motion.div
      ref={containerRef}
      variants={{
        hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 1.1, ease: EASE },
        },
      }}
      className={cn(
        'relative aspect-[4/3] lg:aspect-auto',
        item.size === 'large' ? 'sm:col-span-2 sm:aspect-[16/9]' : 'sm:col-span-1 sm:aspect-[4/3]',
        GRID_CLASSES[item.id],
      )}
    >
      <button
        type="button"
        ref={registerTrigger}
        onClick={onOpen}
        className="group absolute inset-0 h-full w-full cursor-pointer overflow-hidden rounded-image border border-line transition-colors duration-700 ease-luxe hover:border-gold/50 focus-visible:border-gold/50"
      >
        {/* Oversized parallax layer so the drift never reveals edges */}
        <motion.div
          style={{ y: reduceMotion ? 0 : y }}
          className="absolute -inset-y-10 inset-x-0"
        >
          <Image
            src={item.image}
            alt={t(item.altKey)}
            fill
            priority={item.id === 'homlokzat'}
            sizes={SIZES_ATTR[item.size]}
            className="object-cover transition-transform duration-[1400ms] ease-luxe group-hover:scale-[1.03]"
          />
        </motion.div>

        {/* Bottom-third darkening so the caption stays legible */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-obsidian/85 via-obsidian/40 to-transparent"
        />

        <span
          className={cn(
            'absolute bottom-4 left-5 pr-5 text-left font-display text-base italic leading-snug text-ivory sm:text-lg',
            'transition-all duration-700 ease-luxe',
            'lg:translate-y-3 lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100 lg:group-focus-visible:translate-y-0 lg:group-focus-visible:opacity-100',
          )}
        >
          {t(item.captionKey)}
        </span>
      </button>
    </motion.div>
  );
}

function Lightbox({
  index,
  onClose,
  onNavigate,
}: {
  index: number;
  onClose: () => void;
  onNavigate: (next: number) => void;
}) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const item = locationImages[index];
  const count = locationImages.length;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        onNavigate((index + 1) % count);
      } else if (e.key === 'ArrowLeft') {
        onNavigate((index + count - 1) % count);
      } else if (e.key === 'Tab') {
        // Focus trap across the dialog's three controls
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button');
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, count, onClose, onNavigate]);

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t(item.altKey)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.7, ease: EASE }}
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-obsidian/95 backdrop-blur-md"
    >
      {/* Counter */}
      <p
        aria-hidden
        className="absolute left-6 top-6 z-10 text-xs font-light tracking-wide2 text-ivory-faint"
      >
        {index + 1} / {count}
      </p>

      {/* Close */}
      <button
        type="button"
        ref={closeButtonRef}
        aria-label={t('gallery.lightbox.close')}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-6 top-6 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-line text-ivory-muted transition-all duration-500 ease-luxe hover:border-gold hover:text-gold"
      >
        <X size={18} strokeWidth={1.25} />
      </button>

      {/* Prev / next */}
      <button
        type="button"
        aria-label={t('gallery.lightbox.prev')}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate((index + count - 1) % count);
        }}
        className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line text-ivory-muted transition-all duration-500 ease-luxe hover:border-gold hover:text-gold sm:left-6"
      >
        <ChevronLeft size={20} strokeWidth={1.25} />
      </button>
      <button
        type="button"
        aria-label={t('gallery.lightbox.next')}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate((index + 1) % count);
        }}
        className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line text-ivory-muted transition-all duration-500 ease-luxe hover:border-gold hover:text-gold sm:right-6"
      >
        <ChevronRight size={20} strokeWidth={1.25} />
      </button>

      {/* Cross-fading image + caption */}
      <div className="absolute inset-x-16 inset-y-20 sm:inset-x-24">
        <AnimatePresence initial={false}>
          <motion.div
            key={item.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.8, ease: EASE }}
            className="absolute inset-0 flex flex-col"
          >
            <div className="relative min-h-0 flex-1">
              <Image
                src={item.image}
                alt={t(item.altKey)}
                fill
                sizes="100vw"
                className="object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <p
              aria-live="polite"
              onClick={(e) => e.stopPropagation()}
              className="pt-6 text-center font-display text-lg italic text-ivory sm:text-xl"
            >
              {t(item.captionKey)}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function LocationGallery() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [triggerIndex, setTriggerIndex] = useState<number | null>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = () => {
    setOpenIndex(null);
    if (triggerIndex !== null) {
      triggerRefs.current[triggerIndex]?.focus();
    }
    setTriggerIndex(null);
  };

  return (
    <section id="helyszin" className="px-6 py-40 sm:py-52 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Section header — left-aligned, editorial */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10%' }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
          }}
          className="mb-16 max-w-3xl sm:mb-20"
        >
          <motion.p
            variants={{
              hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
              visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
            }}
            className="mb-6 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs"
          >
            {t('sections.helyszin.eyebrow')}
          </motion.p>
          <motion.h2
            variants={{
              hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
              visible: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
            }}
            className="font-display font-light leading-tight text-ivory"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}
          >
            <ItalicTitle copy={t('sections.helyszin.title')} />
          </motion.h2>
        </motion.div>

        {/* Asymmetric bento grid */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10%' }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:auto-rows-[6.5rem] lg:grid-flow-dense lg:grid-cols-12 lg:gap-6"
        >
          {locationImages.map((item, i) => (
            <GalleryItem
              key={item.id}
              item={item}
              onOpen={() => {
                setOpenIndex(i);
                setTriggerIndex(i);
              }}
              registerTrigger={(el) => {
                triggerRefs.current[i] = el;
              }}
            />
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {openIndex !== null && (
          <Lightbox index={openIndex} onClose={close} onNavigate={setOpenIndex} />
        )}
      </AnimatePresence>
    </section>
  );
}
