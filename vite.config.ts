import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true
      },
      manifest: {
        name: 'Plastic Center Cali Nómina',
        short_name: 'Nómina PWA',
        description: 'Sistema de nómina PWA para Plastic Center Cali',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  server: {
    port: 4173
  }
});
