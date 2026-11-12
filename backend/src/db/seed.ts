import { hashPassword } from '../auth/password.js';
import type { Rol } from '../auth/jwt.js';
import { env, isProduction } from '../config/env.js';
import { crearUsuarioSchema } from '../modules/auth/auth.schemas.js';
import { pool } from './pool.js';

interface UsuarioSemilla {
  nombre: string;
  email: string;
  password: string | undefined;
  rol: Rol;
}

/**
 * Siembra idempotente de usuarios por defecto (admin + auditor) para desarrollo y QA.
 * - Desactivado salvo SEED_DEFAULT_USERS=true.
 * - Nunca se ejecuta con NODE_ENV=production.
 * - Las contraseñas vienen del .env y deben cumplir la política de contraseñas.
 * - ON CONFLICT DO NOTHING: no sobrescribe usuarios existentes ni sus contraseñas.
 */
export async function seedDefaultUsers(): Promise<void> {
  if (!env.SEED_DEFAULT_USERS) return;
  if (isProduction) {
    console.warn('[seed] SEED_DEFAULT_USERS ignorado en producción.');
    return;
  }

  const semillas: UsuarioSemilla[] = [
    { nombre: 'Administrador AuditSys', email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD, rol: 'admin' },
    { nombre: 'Auditor Líder AuditSys', email: env.SEED_AUDITOR_EMAIL, password: env.SEED_AUDITOR_PASSWORD, rol: 'auditor' },
  ];

  for (const s of semillas) {
    if (!s.password) {
      console.warn(`[seed] Sin contraseña para ${s.email}; usuario no sembrado.`);
      continue;
    }
    const parsed = crearUsuarioSchema.safeParse(s);
    if (!parsed.success) {
      console.warn(`[seed] Datos inválidos para ${s.email}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      continue;
    }
    const { rowCount } = await pool.query(
      `INSERT INTO usuario (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [parsed.data.nombre, parsed.data.email, await hashPassword(parsed.data.password), parsed.data.rol],
    );
    if (rowCount) console.log(`[seed] Usuario ${parsed.data.rol} creado: ${parsed.data.email}`);
  }
}
