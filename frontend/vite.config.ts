/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El backend solo acepta peticiones desde http://localhost:5173 (CORS_ORIGIN),
// así que el puerto es fijo: si está ocupado, Vite falla en lugar de moverse a otro.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
