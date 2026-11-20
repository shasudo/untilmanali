import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.ico', 'fist-192.png', 'fist-512.png', 'fist-maskable-512.png'],
      manifest: {
        name: 'UntilManali — Crew OS',
        short_name: 'UntilManali',
        description: 'Private money board for the 6.',
        theme_color: '#0e0f0c',
        background_color: '#0e0f0c',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'fist-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'fist-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'fist-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
    })
  ],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  build: { target: 'es2022', cssMinify: true, sourcemap: false }
})
