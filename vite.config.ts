import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Installable and offline (DESIGN.md §1, §13): the app shell, fonts and icons are precached; updates apply on the next visit.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Muzieklab',
        short_name: 'Muzieklab',
        description: 'Practise reading and tapping rhythms, and reading notes.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#eef1f0',
        theme_color: '#2f6669',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  base: './',
  build: {
    // The VexFlow chunk (Bravura glyph data included) is ~565 kB on its own; everything else is far below.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Libraries in their own chunks: cached across app updates, and no single chunk over the 500 kB warning.
        manualChunks: {
          vexflow: ['vexflow/bravura'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
