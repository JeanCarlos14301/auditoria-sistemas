/**
 * Crea (bootstrap) un usuario administrador.
 *   npm run admin:create -- --nombre "Admin" --email admin@audita.local --password "Cl4ve-Segura!2026"
 * También acepta ADMIN_NOMBRE / ADMIN_EMAIL / ADMIN_PASSWORD como variables de entorno.
 */
import { parseArgs } from 'node:util';
import { closePool } from '../db/pool.js';
import { crearUsuarioSchema } from '../modules/auth/auth.schemas.js';
import { crearUsuario } from '../modules/auth/auth.service.js';

const { values } = parseArgs({
  options: {
    nombre: { type: 'string' },
    email: { type: 'string' },
    password: { type: 'string' },
  },
});

const parsed = crearUsuarioSchema.safeParse({
  nombre: values.nombre ?? process.env.ADMIN_NOMBRE,
  email: values.email ?? process.env.ADMIN_EMAIL,
  password: values.password ?? process.env.ADMIN_PASSWORD,
  rol: 'admin',
});

if (!parsed.success) {
  console.error('Datos inválidos:');
  for (const i of parsed.error.issues) console.error(`  - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}

try {
  const admin = await crearUsuario(parsed.data);
  console.log(`Administrador creado: id=${admin.id} email=${admin.email}`);
} catch (err) {
  console.error('No se pudo crear el administrador:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await closePool();
}
