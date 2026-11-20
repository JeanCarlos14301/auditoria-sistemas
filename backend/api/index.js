/**
 * Punto de entrada para Vercel Functions.
 *
 * En local la API arranca con src/index.ts (servidor HTTP propio). En Vercel no hay
 * servidor persistente: cada petición la atiende esta función, que exporta la app
 * Express ya compilada (npm run build -> dist/). vercel.json redirige todas las
 * rutas aquí.
 */
import { createApp } from '../dist/app.js';

export default createApp();
