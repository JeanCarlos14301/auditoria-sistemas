/**
 * Punto de entrada de AuditA API.
 * - Verifica la conexión a PostgreSQL (fail-fast).
 * - Siembra los usuarios por defecto (solo si SEED_DEFAULT_USERS=true y no es producción).
 * - Monta la app Express (Helmet, CORS, JSON parser, rutas /api, errorHandler) definida en app.ts.
 */
import { createApp } from './app.js';
import { env } from './config/env.js';
import { checkDatabaseConnection, closePool } from './db/pool.js';
import { seedDefaultUsers } from './db/seed.js';

async function main(): Promise<void> {
  try {
    await checkDatabaseConnection();
    console.log('[db] Conexión a PostgreSQL establecida');
  } catch (err) {
    console.error('[db] No se pudo conectar a PostgreSQL:', (err as Error).message);
    console.error('     ¿Está levantado el contenedor? -> npm run db:up');
    process.exit(1);
  }

  await seedDefaultUsers();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[api] AuditA escuchando en http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
  });

  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[api] ${signal} recibido, cerrando...`);
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(async () => {
      await closePool().catch(() => undefined);
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Promesa rechazada sin manejar:', reason);
});

void main();
