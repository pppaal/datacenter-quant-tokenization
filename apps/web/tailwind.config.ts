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
        foregroundMuted: 'hsl(var(--foreground-muted))',
        panel: 'hsl(var(--panel))',
        panelAlt: 'hsl(var(--panel-alt))',
        surfaceHover: 'hsl(var(--surface-hover))',
        border: 'hsl(var(--border))',
        borderStrong: 'hsl(var(--border-strong))',
        muted: 'hsl(var(--muted))',
        accent: 'hsl(var(--accent))',
        accentHover: 'hsl(var(--accent-hover))',
        accentTint: 'hsl(var(--accent-tint))',
        success: 'hsl(var(--success))',
        successTint: 'hsl(var(--success-tint))',
        warning: 'hsl(var(--warning))',
        warningTint: 'hsl(var(--warning-tint))',
        danger: 'hsl(var(--danger))',
        dangerTint: 'hsl(var(--danger-tint))',
        info: 'hsl(var(--info))',
        infoTint: 'hsl(var(--info-tint))'
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        // `glow` key retained so existing `shadow-glow` classes survive the
        // dark→light swap; it now resolves to the soft light card shadow.
        glow: 'var(--shadow-sm)',
        card: 'var(--shadow-sm)',
        lift: 'var(--shadow-md)'
      },
      backgroundImage: {
        grid: 'linear-gradient(to right, rgba(16, 24, 40, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(16, 24, 40, 0.04) 1px, transparent 1px)'
      }
    }
  },
  plugins: []
};

export default config;
