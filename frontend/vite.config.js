import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to Django backend during development
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/p': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../backend/static/dist',
    emptyOutDir: true,
  },
})
