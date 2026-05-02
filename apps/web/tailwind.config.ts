import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace']
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        panel: 'hsl(var(--panel))',
        panelAlt: 'hsl(var(--panel-alt))',
        border: 'hsl(var(--border))',
        muted: 'hsl(var(--muted))',
        accent: 'hsl(var(--accent))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124, 156, 194, 0.12), 0 24px 80px rgba(4, 11, 24, 0.45)'
      },
      backgroundImage: {
        grid: 'linear-gradient(to right, rgba(124, 156, 194, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(124, 156, 194, 0.08) 1px, transparent 1px)'
      }
    }
  },
  plugins: []
};

export default config;
