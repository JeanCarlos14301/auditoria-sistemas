import express, { type Express } from 'express';
import { checkDatabaseConnection } from './db/pool.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { apiRateLimiter } from './middlewares/rateLimit.js';
import { corsPolicy, noStore, requireJsonBody, securityHeaders } from './middlewares/security.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { auditoriasRouter } from './routes/auditorias.routes.js';
import { controlesRouter } from './routes/controles.routes.js';
import { ejecucionRouter } from './routes/ejecucion.routes.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', false); // Ajustar al número de proxies si se despliega tras uno.
  app.set('etag', false);
  app.set('query parser', 'simple'); // Sin objetos anidados en query (evita contaminación de parámetros).

  // --- Capa de seguridad global (el orden importa) ---
  app.use(securityHeaders);
  app.use(corsPolicy);
  app.use(noStore);
  app.use(requireJsonBody);
  app.use(express.json({ limit: '100kb', strict: true }));

  // --- Raíz: información del servicio (la API no sirve HTML) ---
  app.get(['/', '/api'], (_req, res) => {
    res.json({
      servicio: 'AuditA API',
      version: '1.0.0',
      documentacion: 'Ver backend/API.md',
      endpoints: {
        health: 'GET /api/health',
        auth: 'POST /api/auth/login · GET /api/auth/me · GET|POST /api/auth/usuarios (admin)',
        controles: 'GET /api/controles · POST /api/controles (admin)',
        auditorias:
          'GET|POST /api/auditorias · GET /api/auditorias/:id · POST /:id/alcance · PATCH /:id/estado · GET /:id/metricas|trazabilidad|informe|verificar-integridad',
        ejecucion:
          'PATCH /api/evaluaciones/:id · POST /api/evaluaciones/:id/evidencias|hallazgos · POST /api/hallazgos/:id/recomendaciones',
      },
    });
  });

  // --- Health check (sin auth, sin rate limit) ---
  app.get('/api/health', async (_req, res) => {
    try {
      await checkDatabaseConnection();
      res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'unreachable', timestamp: new Date().toISOString() });
    }
  });

  app.use('/api', apiRateLimiter);

  // --- Rutas ---
  app.use('/api/auth', authRouter);
  app.use('/api/controles', controlesRouter);
  app.use('/api/auditorias', auditoriasRouter);
  app.use('/api', ejecucionRouter); // /evaluaciones/:id[...], /hallazgos/:id/recomendaciones

  // --- Manejo de errores ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
