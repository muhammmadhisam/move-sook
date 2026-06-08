/**
 * Shared Tailwind preset — Untitled UI design language.
 * Semantic tokens are HSL channels (see packages/ui/globals.css) referenced with
 * <alpha-value> so opacity modifiers work. Raw scales (brand/gray/error/...) are
 * exposed for component-level fine-tuning.
 * @type {Partial<import("tailwindcss").Config>}
 */
export default {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans Thai', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── Semantic tokens (themeable, light/dark) ──────────────────────────
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        // ── MoveSook brand scales ────────────────────────────────────────────
        // Primary brand = logo red. `brand` is the primary scale (drives --primary,
        // badges, highlights). `navy` is the secondary brand (nav/sidebar chrome).
        brand: {
          25: '#FFF8F8',
          50: '#FEF1F1',
          100: '#FDE0E1',
          200: '#FBC5C7',
          300: '#F79A9E',
          400: '#F1656C',
          500: '#E83C44',
          600: '#E0202A', // logo red — DEFAULT primary
          700: '#BC1721',
          800: '#9C171F',
          900: '#821920',
          950: '#47090C',
        },
        navy: {
          25: '#F4F7FB',
          50: '#EAF0F8',
          100: '#D5E0EF',
          200: '#ABC1DE',
          300: '#7E9DC7',
          400: '#4E73A8',
          500: '#2A5188',
          600: '#1A3E6B',
          700: '#122F52',
          800: '#0C2340',
          900: '#0A1D35', // logo navy — secondary brand / chrome
          950: '#061226',
        },
        gray: {
          25: '#FCFCFD',
          50: '#F9FAFB',
          100: '#F2F4F7',
          200: '#EAECF0',
          300: '#D0D5DD',
          400: '#98A2B3',
          500: '#667085',
          600: '#475467',
          700: '#344054',
          800: '#1D2939',
          900: '#101828',
          950: '#0C111D',
        },
        error: {
          25: '#FFFBFA',
          50: '#FEF3F2',
          100: '#FEE4E2',
          200: '#FECDCA',
          300: '#FDA29B',
          400: '#F97066',
          500: '#F04438',
          600: '#D92D20',
          700: '#B42318',
          800: '#912018',
          900: '#7A271A',
        },
        successScale: {
          50: '#ECFDF3',
          100: '#DCFAE6',
          200: '#ABEFC6',
          500: '#17B26A',
          600: '#079455',
          700: '#067647',
        },
        warningScale: {
          50: '#FFFAEB',
          100: '#FEF0C7',
          200: '#FEDF89',
          500: '#F79009',
          600: '#DC6803',
          700: '#B54708',
        },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Untitled UI elevation scale
        xs: '0 1px 2px 0 rgb(16 24 40 / 0.05)',
        sm: '0 1px 3px 0 rgb(16 24 40 / 0.10), 0 1px 2px -1px rgb(16 24 40 / 0.06)',
        md: '0 4px 8px -2px rgb(16 24 40 / 0.10), 0 2px 4px -2px rgb(16 24 40 / 0.06)',
        lg: '0 12px 16px -4px rgb(16 24 40 / 0.08), 0 4px 6px -2px rgb(16 24 40 / 0.03)',
        xl: '0 20px 24px -4px rgb(16 24 40 / 0.08), 0 8px 8px -4px rgb(16 24 40 / 0.03)',
      },
    },
  },
  plugins: [],
};
