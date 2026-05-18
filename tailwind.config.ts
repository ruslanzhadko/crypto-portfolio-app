import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        background: '#0a0a0f',
        surface: '#111118',
        'surface-2': '#1a1a24',
        border: '#2a2a3a',
        primary: {
          DEFAULT: '#6c63ff',
          hover: '#5a52e8',
          foreground: '#ffffff',
        },
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        text: '#e8e8f0',
        'text-muted': '#8888a8',
        muted: {
          DEFAULT: '#1a1a24',
          foreground: '#8888a8',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#1a1a24',
          foreground: '#e8e8f0',
        },
        popover: {
          DEFAULT: '#111118',
          foreground: '#e8e8f0',
        },
        card: {
          DEFAULT: '#111118',
          foreground: '#e8e8f0',
        },
        input: '#2a2a3a',
        ring: '#6c63ff',
        foreground: '#e8e8f0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.4)',
        glow: '0 0 20px rgba(108,99,255,0.3)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #6c63ff 0%, #a855f7 100%)',
        'gradient-card': 'linear-gradient(145deg, #111118 0%, #1a1a24 100%)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
