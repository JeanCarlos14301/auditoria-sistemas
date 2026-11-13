import type { Config } from 'tailwindcss';

// Los colores no viven aquí: son tokens CSS (src/styles/tokens.css) que cambian con el tema.
// Tailwind solo les da nombre para poder usarlos como utilidades.
const token = (n: string) => `var(--${n})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'), surface: token('surface'), raise: token('raise'), line: token('line'),
        ink: token('ink'), muted: token('muted'), accent: token('accent'), 'on-accent': token('on-accent'),
        alert: token('alert'), ok: token('ok'), warn: token('warn'), bad: token('bad'), na: token('na'),
      },
      fontFamily: { sans: token('f-text'), accent: token('f-acc'), mono: token('f-mono') },
      maxWidth: { wrap: token('wrap') },
      transitionTimingFunction: { entrada: token('e-in'), estado: token('e-st') },
    },
  },
  plugins: [],
} satisfies Config;
