import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build: 2026-08-01
export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
