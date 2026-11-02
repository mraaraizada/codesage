import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // The backend (server/src/index.ts) runs on 8787 by default; proxy /api so the browser
      // never needs CORS workarounds during the dev demo.
      '/api': {
        target: process.env.CODESAGE_SERVER_URL || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
