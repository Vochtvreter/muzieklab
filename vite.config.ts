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
        // API addresses are fetches to the server, never the app shell (BACKEND-PLAN.md §1).
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  base: './',
  // npm run dev: the API (server/, default port 3000) on the same origin, as Caddy does on the site. The proxy keeps
  // the Host header, so the API's Origin check (BACKEND-PLAN.md §5.4) sees the dev server's own address.
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  // vite preview (and e2e, which runs on it) has no API, like production today: without this it would use the proxy above.
  preview: {
    proxy: {},
  },
  // JSON modules (the message catalogs) as JSON.parse of a string: faster to load than the same data as a JS object.
  json: { stringify: true },
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
