/* Tailwind config — design tokens for the interior-design aesthetic.
 *
 * The palette is warm and grounded (cream / sand / stone / clay) with
 * a single muted forest-green accent. Typography pairs a serif
 * display face with a clean sans-serif body.
 *
 * Per ADR-007 (Tailwind CSS) + `docs/04-system-architecture.md §4.2`
 * (premium typography, generous whitespace, strong hierarchy).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#faf8f4',
          100: '#f3eee5',
          200: '#e8dfcc',
          300: '#d8c8a6',
        },
        sand: {
          100: '#efe7d8',
          300: '#c9b893',
          500: '#a89066',
          700: '#7c6743',
        },
        stone: {
          50: '#f7f6f4',
          100: '#ecebe7',
          300: '#c5c1b8',
          500: '#8a867d',
          700: '#56544f',
          900: '#2b2a27',
        },
        forest: {
          500: '#3f5d49',
          700: '#2a4031',
        },
        clay: {
          500: '#a86b4f',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        // Display scale tuned for premium feel.
        'display-xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-lg': ['3.25rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
      },
      spacing: {
        // Generous whitespace — the architecture doc explicitly calls
        // for this.
        '18': '4.5rem',
        '22': '5.5rem',
      },
    },
  },
  plugins: [],
};