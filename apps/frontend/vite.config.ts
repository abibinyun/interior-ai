/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite config — used for `vite dev`, `vite build`, AND as the Vitest
// config (the `test` block at the bottom).
//
// Dev proxy: requests to `/api/*` from the browser are forwarded to the
// backend. By default this points at `http://localhost:3000` for a
// developer running backend + frontend on the same host. In Docker
// (`docker compose up frontend`) we override `VITE_API_TARGET` to
// `http://backend:3000` so the in-container Vite dev server can reach
// the backend service by its compose name.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});