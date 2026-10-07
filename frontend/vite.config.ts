import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Browser talks to /api on the same origin; Vite forwards to the NestJS server.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
