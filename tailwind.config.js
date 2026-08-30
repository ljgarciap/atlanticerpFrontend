/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta AtlanticERP (agregado 2026-08-30) — tomada del isólogo real de la marca
        // (Atlantic/ats.jpeg): azul marino del swirl/wordmark como primary, coral del
        // swirl como accent. Reemplaza la paleta teal/verde heredada de Illuminations.
        primary:  { DEFAULT: '#2B3F73', dark: '#1B2A52', light: '#4A63A0', soft: '#E9ECF6' },
        accent:   { DEFAULT: '#E8734A', dark: '#C85A34' },
        brand:    '#1B2A52',
        surface:  '#fafaf7',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
