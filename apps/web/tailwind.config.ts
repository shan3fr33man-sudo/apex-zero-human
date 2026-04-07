import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        apex: {
          bg: '#0A0A0A',
          surface: '#111111',
          border: '#1F1F1F',
          text: '#F5F5F5',
          muted: '#9A9A9A',
          accent: '#00FF88',
          warning: '#FFB800',
          danger: '#FF4444',
          info: '#3B82F6',
        },
      },
      fontFamily: {
        mono: ['var(--font-space-mono)', 'monospace'],
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      },
      spacing: {
        sidebar: '240px',
        'right-panel': '320px',
      },
    },
  },
  plugins: [],
};

export default config;
