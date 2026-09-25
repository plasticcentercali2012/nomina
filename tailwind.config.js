export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a',
        accent: '#409141',
        brand: {
          50: '#f2f9f2', 100: '#dff0df', 200: '#c0e2c1',
          300: '#94cd96', 400: '#65b367', 500: '#409141',
          600: '#347c36', 700: '#2c632e', 800: '#274f29',
          900: '#214225', 950: '#0e2412'
        }
      }
    }
  },
  plugins: []
};
