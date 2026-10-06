// White-label tokens: each colour reads a --ld-* variable set on the LTI root element and falls
// back to the original value, so nothing changes anywhere the variable is not set.
const v = (name, rgb) => `rgb(var(--ld-${name}, ${rgb}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        black: '#0a0a0a',
        cream: '#f0ede6',
        'cream-light': '#f5f3ee',
        surface: {
          DEFAULT: v('surface', '10 10 10'),
          alt: v('surface-alt', '17 17 17'),
          deep: v('surface-deep', '13 13 13'),
          bar: v('surface-bar', '15 15 15'),
        },
        fg: v('text', '245 243 238'),
        ink: v('ink', '255 255 255'),
        // rules: a solid brand border colour replaces the translucent ink, with faint opacities lifted
        edge: 'rgb(var(--ld-edge, 255 255 255) / calc(<alpha-value> * var(--ld-edge-k, 1)))',
        'on-primary': v('on-primary', '255 255 255'),
        'on-accent': v('on-accent', '255 255 255'),
        mint: v('mint', '127 200 178'),
        jade: v('jade', '78 165 138'),
        azure: v('azure', '15 91 137'),
        green: {
          DEFAULT: v('primary', '26 107 60'),
          light: v('accent', '45 158 95'),
          pale: '#e8f5ee',
        },
        amber: {
          DEFAULT: '#d4830a',
          pale: '#fef3e0',
          200: v('amber-200', '253 230 138'),
          300: v('amber-300', '252 211 77'),
          400: v('amber-400', '251 191 36'),
        },
        red: {
          300: v('red-300', '252 165 165'),
          400: v('red-400', '248 113 113'),
        },
        emerald: {
          300: v('emerald-300', '110 231 183'),
          400: v('emerald-400', '52 211 153'),
        },
        violet: { 400: v('violet-400', '167 139 250') },
        sky: { 400: v('sky-400', '56 189 248') },
        slate: {
          DEFAULT: '#2c3e50',
          mid: v('soft', '84 110 122'),
          light: v('soft-light', '176 190 197'),
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
