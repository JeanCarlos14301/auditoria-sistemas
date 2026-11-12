import pg from 'pg';
import { env } from '../config/env.js';

const { Pool, types } = pg;

// DATE (OID 1082) se devuelve como 'YYYY-MM-DD' sin conversión a Date,
// evitando desplazamientos de un día por zona horaria.
types.setTypeParser(1082, (value: string) => value);
// NUMERIC (OID 1700) -> number. Los valores del dominio (p. ej. NUMERIC(5,2)) caben sin pérdida.
types.setTypeParser(1700, (value: string) => Number(value));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
  query_timeout: 20_000,
  application_name: 'audita-api',
});

pool.on('error', (err) => {
  // Error en un cliente inactivo (p. ej. reinicio de PostgreSQL). No tumbar el proceso.
  console.error('[db] Error inesperado en cliente inactivo del pool:', err.message);
});

export type DbClient = pg.PoolClient;
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

/**
 * Consulta parametrizada. TODO acceso a datos debe pasar valores como `params`
 * (nunca concatenados en el SQL) para prevenir inyección SQL (OWASP A03).
 */
export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  db: Queryable = pool,
): Promise<pg.QueryResult<R>> {
  return db.query<R>(text, params as unknown[]);
}

/**
 * Ejecuta `fn` dentro de una transacción. Hace COMMIT si resuelve y ROLLBACK si lanza.
 */
export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db] Fallo en ROLLBACK:', (rollbackErr as Error).message);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closePool(): Promise<void> {
  await pool.end();
}
