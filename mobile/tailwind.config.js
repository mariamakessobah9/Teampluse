/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        surface: {
          page: '#f5f7f6',
          card: '#ffffff',
          header: '#e5f3ea',
          chip: '#eef2f1',
          bubbleIn: '#eef0f1',
        },
        ink: {
          900: '#0b1220',
          700: '#1f2937',
          500: '#4b5563',
          400: '#6b7280',
          300: '#9ca3af',
          200: '#d1d5db',
        },
        dark: {
          100: '#1e293b',
          200: '#0f172a',
          300: '#020617',
        },
      },
    },
  },
  plugins: [],
};
