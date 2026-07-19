'use client';

import { motion, useScroll } from 'framer-motion';

/**
 * A single gold hairline at the very top of the viewport that fills with
 * scroll progress — position feedback in the site's hairline language,
 * deliberately 1px so it never reads as a progress bar.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[70] h-px origin-left bg-gradient-to-r from-gold-deep via-gold to-gold-bright"
      style={{ scaleX: scrollYProgress }}
    />
  );
}
