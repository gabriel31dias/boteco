/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/games/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          darkest: '#070510',
          darker: '#0a0718',
          dark: '#0e0a22',
          card: '#150f2e',
          cardLight: '#1b133c',
          cardHighlight: '#22194d',
        },
        brand: {
          purple: '#8b5cf6',
          purpleBright: '#a855f7',
          purpleDark: '#6d28d9',
          purpleGlow: '#9333ea',
          gold: '#f59e0b',
          goldLight: '#fcd34d',
          goldBright: '#fbbf24',
          goldDark: '#b45309',
          green: '#22c55e',
          greenBright: '#4ade80',
          blue: '#3b82f6',
          blueBright: '#60a5fa',
          red: '#ef4444',
          redBright: '#f87171',
        }
      },
      boxShadow: {
        'glow-purple': '0 0 25px -5px rgba(168, 85, 247, 0.45)',
        'glow-purple-sm': '0 0 15px -3px rgba(168, 85, 247, 0.35)',
        'glow-gold': '0 0 25px -5px rgba(245, 158, 11, 0.45)',
        'glow-gold-sm': '0 0 15px -3px rgba(245, 158, 11, 0.35)',
        'glow-green': '0 0 20px -5px rgba(34, 197, 94, 0.45)',
        'glow-blue': '0 0 20px -5px rgba(59, 130, 246, 0.45)',
        'card-inner': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.1)',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        }
      }
    },
  },
  plugins: [],
}
