/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sarkari: {
          red: '#d32f2f',
          darkred: '#b71c1c',
          blue: '#1565c0',
          yellow: '#ffeb3b',
          green: '#2e7d32',
          orange: '#e65100'
        }
      }
    },
  },
  plugins: [],
}
