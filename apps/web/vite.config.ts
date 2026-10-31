import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Use the shared package's TypeScript source directly, so form validation
      // in the browser is literally the same code the API runs.
      '@talented/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  envDir: '../../', // read VITE_* from the repo-root .env
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely: separate chunks stay cached across deploys
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', 'axios', 'zod', 'react-hook-form', '@hookform/resolvers'],
          markdown: ['react-markdown'],
        },
      },
    },
  },
});
