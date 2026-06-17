import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In local dev, proxy /api calls to a local function emulator or skip
  // On Vercel, /api/* routes are handled automatically by api/ directory
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
