import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The web app talks to the API through /api so there is no CORS in development or in a single-origin deploy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
