import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#0A0908',
          800: '#12100D',
          700: '#1A1712',
        },
        gold: {
          DEFAULT: '#C6A15B',
          bright: '#E3C77E',
          deep: '#8C6D2F',
        },
        ivory: {
          DEFAULT: '#F1E9DC',
          muted: '#C9C1B4',
          faint: '#8E877A',
        },
        line: 'rgba(198,161,91,0.18)',
        wine: '#5A2A2E',
      },
      fontFamily: {
        display: ['var(--font-cormorant)', 'Cormorant Garamond', 'serif'],
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
      letterSpacing: {
        eyebrow: '0.28em',
        wide2: '0.18em',
        wide3: '0.32em',
      },
      borderRadius: {
        card: '10px',
        image: '8px',
      },
      transitionTimingFunction: {
        luxe: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
