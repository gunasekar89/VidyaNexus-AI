/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Noto Sans Kannada"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef0ff',
          100: '#e0e4ff',
          200: '#c7cdfe',
          500: '#4f5bd5',
          600: '#3b47c4',
          700: '#2f3aa3',
          900: '#1d296d',
        },
        ink: '#1b1f3b',
        muted: '#6b7190',
        canvas: '#f3f4fb',
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,31,59,0.04), 0 4px 16px rgba(27,31,59,0.05)',
      },
    },
  },
  plugins: [],
}
