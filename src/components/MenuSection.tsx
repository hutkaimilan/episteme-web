'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ChefHat } from 'lucide-react';
import { categoryOrder, dishes, foodCategories, type Dish } from '@/data/menu';
import { useI18n } from '@/i18n/LanguageProvider';
import { cn, parseItalics } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

const REVEAL = (reduceMotion: boolean) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
});

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

/** Localizes the canonical Hungarian price suffixes; the '/ 50g' suffix is universal. */
function useLocalizedPrice() {
  const { t } = useI18n();
  return (price: string) =>
    price
      .replace('/ 2 fő', t('menu.suffixes.twoPersons'))
      .replace('/ adag', t('menu.suffixes.portion'));
}

function ChefBadge() {
  const { t } = useI18n();
  return (
    <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full border border-gold/60 bg-obsidian/70 px-3.5 py-1.5 text-[0.625rem] font-light uppercase tracking-eyebrow text-gold backdrop-blur-sm">
      <ChefHat size={12} strokeWidth={1.25} aria-hidden />
      {t('menu.chefsSelection')}
    </span>
  );
}

function DishCard({ dish }: { dish: Dish }) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const localizedPrice = useLocalizedPrice();
  const featured = dish.chefsSelection === true;

  return (
    <motion.article
      variants={REVEAL(reduceMotion ?? false)}
      className={cn(
        'group overflow-hidden rounded-card border bg-obsidian-700/[.92] backdrop-blur-sm transition-all duration-700 ease-luxe hover:-translate-y-1',
        featured
          ? 'border-gold/35 hover:border-gold/70 sm:col-span-2'
          : 'border-line hover:border-gold/50',
      )}
    >
      <div className={cn('relative overflow-hidden', featured ? 'aspect-[16/9]' : 'aspect-[4/3]')}>
        {featured && <ChefBadge />}
        {dish.image && (
          <Image
            src={dish.image}
            alt={`${t(dish.nameKey)} — ${t(dish.descKey)}`}
            fill
            sizes={
              featured
                ? '(min-width: 1024px) 66vw, 100vw'
                : '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'
            }
            className="object-cover transition-transform duration-[1400ms] ease-luxe group-hover:scale-[1.03]"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-obsidian-700/90 to-transparent"
        />
      </div>

      <div className={cn('p-6', featured && 'sm:p-8')}>
        <div className="flex items-baseline justify-between gap-4">
          <h4
            className={cn(
              'font-display font-normal text-ivory',
              featured ? 'text-2xl sm:text-3xl' : 'text-xl',
            )}
          >
            {t(dish.nameKey)}
          </h4>
          <p className="shrink-0 text-sm font-normal tracking-wide2 text-gold">
            {localizedPrice(dish.price)}
          </p>
        </div>
        <p className="mt-3 max-w-2xl text-sm font-light leading-relaxed text-ivory-muted">
          {t(dish.descKey)}
        </p>
      </div>
    </motion.article>
  );
}

function DrinkRow({ dish }: { dish: Dish }) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const localizedPrice = useLocalizedPrice();

  return (
    <motion.li variants={REVEAL(reduceMotion ?? false)}>
      <div className="flex items-baseline gap-4">
        <h4 className="font-display text-lg font-normal text-ivory sm:text-xl">
          {t(dish.nameKey)}
        </h4>
        <span aria-hidden className="flex-1 -translate-y-1 border-b border-dotted border-gold/30" />
        <p className="shrink-0 text-sm font-normal tracking-wide2 text-gold">
          {localizedPrice(dish.price)}
        </p>
      </div>
      <p className="mt-1.5 max-w-xl text-xs font-light leading-relaxed text-ivory-faint sm:text-sm">
        {t(dish.descKey)}
      </p>
    </motion.li>
  );
}

function CategoryDivider({ category, index }: { category: Dish['category']; index: number }) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={REVEAL(reduceMotion ?? false)}
      className="flex items-baseline gap-5"
    >
      <span aria-hidden className="text-xs font-light tracking-eyebrow text-gold">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h3 className="font-display text-2xl font-light text-ivory sm:text-3xl">
        {t(`menu.categories.${category}`)}
      </h3>
      <span
        aria-hidden
        className="flex-1 -translate-y-1.5 border-b border-line [border-image:linear-gradient(to_right,rgba(198,161,91,0.35),transparent)_1]"
      />
    </motion.div>
  );
}

function CategoryBlock({ category, index }: { category: Dish['category']; index: number }) {
  const reduceMotion = useReducedMotion();
  const items = dishes.filter((dish) => dish.category === category);
  const isFood = foodCategories.includes(category);

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-10%' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
      }}
    >
      <CategoryDivider category={category} index={index} />

      {isFood ? (
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3">
          {items.map((dish) => (
            <DishCard key={dish.id} dish={dish} />
          ))}
        </div>
      ) : (
        <ul className="mt-10 max-w-3xl space-y-8">
          {items.map((dish) => (
            <DrinkRow key={dish.id} dish={dish} />
          ))}
        </ul>
      )}
    </motion.div>
  );
}

export default function MenuSection() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <section id="etlap" className="px-6 py-40 sm:py-52 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Section header — left-aligned, matching prior sections */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10%' }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
          }}
          className="mb-20 max-w-3xl sm:mb-24"
        >
          <motion.p
            variants={REVEAL(reduceMotion ?? false)}
            className="mb-6 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs"
          >
            {t('sections.etlap.eyebrow')}
          </motion.p>
          <motion.h2
            variants={REVEAL(reduceMotion ?? false)}
            className="font-display font-light leading-tight text-ivory"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}
          >
            <ItalicTitle copy={t('sections.etlap.title')} />
          </motion.h2>
        </motion.div>

        <div className="space-y-24 sm:space-y-28">
          {categoryOrder.map((category, i) => (
            <CategoryBlock key={category} category={category} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
