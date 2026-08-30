/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary:  { DEFAULT: '#5BA5A0', dark: '#3D7E7A', light: '#6FBAB5', soft: '#E3F0EF' },
        accent:   { DEFAULT: '#9fc54d', dark: '#83a33e' },
        brand:    '#2a2520',
        surface:  '#fafaf7',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
