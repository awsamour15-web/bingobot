import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build: 2026-08-01 — Optimized for performance
export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    // Code-splitting: separate chunks for each screen
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom', 'socket.io-client'],
        },
      },
    },
    minify: 'esbuild',
    // Enable CSS code-splitting
    cssCodeSplit: true,
    // Increase chunk size warning threshold
    chunkSizeWarningLimit: 500,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
});
