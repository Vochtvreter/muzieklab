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
        // Only the app's own address (./, ./index.html) is answered with the app, from the precache; every other one is
        // the server's (a 404, an API address: BACKEND-PLAN.md §1). The app routes with # hashes, so it has no other
        // address, and with base './' its ./assets addresses would point under the path asked for (/learn/assets/…).
        navigateFallback: null,
      },
    }),
  ],
  base: './',
  // npm run dev: the API (server/, default port 3000) on the same origin, as Caddy does on the site. The API's Origin
  // check (BACKEND-PLAN.md §5.4) compares Origin with Host, so the proxy must pass the browser's Host on unchanged:
  // changeOrigin: false. (The string shorthand, '/api': 'http://…', turns changeOrigin on and sends the target's Host,
  // and the API then refuses every POST, PATCH and DELETE with bad_origin. devProxy.test.ts checks this.)
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
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
