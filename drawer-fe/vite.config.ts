/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = process.env.DRAWER_BACKEND ?? '127.0.0.1:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The backend (drawer-be) listens on 127.0.0.1:3000; REST and WebSocket share that port.
    // DRAWER_BACKEND=host:port points the proxy elsewhere when 3000 is taken.
    proxy: {
      '/api': `http://${backend}`,
      '/ws': { target: `ws://${backend}`, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
