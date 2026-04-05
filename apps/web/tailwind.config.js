/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        black: '#0a0a0a',
        cream: '#f0ede6',
        'cream-light': '#f5f3ee',
        green: {
          DEFAULT: '#1a6b3c',
          light: '#2d9e5f',
          pale: '#e8f5ee',
        },
        amber: {
          DEFAULT: '#d4830a',
          pale: '#fef3e0',
        },
        slate: {
          DEFAULT: '#2c3e50',
          mid: '#546e7a',
          light: '#b0bec5',
        },
        border: '#e0dbd2',
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.08)',
        'card-lg': '0 12px 48px rgba(0,0,0,0.14)',
      },
    },
  },
  plugins: [],
}
