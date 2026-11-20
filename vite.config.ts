import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vite builds the frontend into dist/.
// In development, /api calls are forwarded to the Express server (port 3000),
// so run both: `npm run dev` (this) and `npm run dev:server` (the API).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
