/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Deep Navy sidebar (constant across both light & dark modes)
        sidebar: {
          DEFAULT: '#172A46',
          hover: '#1E3A5F',
          active: '#244670',
          border: '#26405F',
          text: '#B8C5D9',
          'text-bright': '#FFFFFF',
          muted: '#6B7A91',
        },
        // ESMMS brand accent blue
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        // Light theme surfaces (high contrast borders & clean slate background)
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F8FAFC',
          tertiary: '#F1F5F9',
          border: '#CBD5E1',
          'border-strong': '#94A3B8',
        },
        // True neutral dark surfaces (charcoal / dark-grey, NOT blue-tinted)
        dark: {
          bg: '#101212',
          surface: '#1C1F1F',
          elevated: '#232626',
          border: '#303333',
          'border-strong': '#3A3D3D',
          text: '#F2F3F3',
          'text-secondary': '#A6AAAA',
          'text-muted': '#777D7D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.9375rem' }], // 11px
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],      // 13px (up from 12px)
        sm: ['0.9375rem', { lineHeight: '1.375rem' }],     // 15px (up from 14px)
        base: ['1.0625rem', { lineHeight: '1.625rem' }],   // 17px (up from 16px)
        lg: ['1.1875rem', { lineHeight: '1.75rem' }],      // 19px (up from 18px)
        xl: ['1.3125rem', { lineHeight: '1.875rem' }],     // 21px (up from 20px)
        '2xl': ['1.5625rem', { lineHeight: '2rem' }],      // 25px (up from 24px)
        '3xl': ['1.9375rem', { lineHeight: '2.25rem' }],   // 31px (up from 30px)
        '4xl': ['2.375rem', { lineHeight: '2.625rem' }],    // 38px (up from 36px)
      },
      borderRadius: {
        btn: '8px',
        card: '12px',
        dialog: '14px',
      },
      boxShadow: {
        overlay: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        dialog: '0 12px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
