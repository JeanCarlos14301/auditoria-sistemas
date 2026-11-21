/**
 * Ejecuta sql/init_auditsys.sql contra la base indicada en DATABASE_URL.
 * Pensado para bases gestionadas (Neon) cuyo editor web no admite varias sentencias.
 *
 *   DATABASE_URL="postgresql://..." npm run db:init
 *
 * El SQL va dentro de BEGIN/COMMIT: si las tablas ya existen, falla sin cambiar nada.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.DATABASE_URL?.trim();
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('Defina DATABASE_URL con la cadena postgresql:// de la base destino.');
  process.exit(1);
}

const sqlPath = fileURLToPath(new URL('../../sql/init_auditsys.sql', import.meta.url));
const sql = await readFile(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const { rows } = await client.query<{ existe: boolean }>(
    "SELECT to_regclass('public.usuario') IS NOT NULL AS existe",
  );
  if (rows[0]?.existe) {
    console.log('El esquema ya existe (tabla usuario presente). No se hizo ningún cambio.');
  } else {
    // Protocolo simple de consultas: admite varias sentencias en un solo envío.
    await client.query(sql);
    const { rows: c } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM control');
    console.log(`Esquema creado. Controles ISO 27002 cargados: ${c[0]?.n}`);
  }
} catch (err) {
  const e = err as { message?: string; code?: string; errors?: { message?: string }[] };
  const detalle = e.message || e.errors?.map((x) => x.message).join('; ') || e.code || String(err);
  console.error('Error al inicializar la base:', detalle);
  process.exitCode = 1;
} finally {
  await client.end();
}
