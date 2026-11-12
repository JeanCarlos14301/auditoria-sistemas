import { signAccessToken, type Rol } from '../../auth/jwt.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../auth/password.js';
import { query, type Queryable } from '../../db/pool.js';
import { AppError } from '../../errors/AppError.js';
import type { AuthUser } from '../../types/domain.js';
import type { CrearUsuarioInput, LoginInput } from './auth.schemas.js';

export interface UsuarioPublico extends AuthUser {
  creado_en: Date;
}

export interface LoginResult {
  token: string;
  token_type: 'Bearer';
  expires_at: string;
  usuario: AuthUser;
}

const CREDENCIALES_INVALIDAS = 'Credenciales inválidas';

export async function login({ email, password }: LoginInput): Promise<LoginResult> {
  const { rows } = await query<AuthUser & { password_hash: string }>(
    'SELECT id, nombre, email, rol, password_hash FROM usuario WHERE email = $1',
    [email],
  );
  const row = rows[0];

  // Mismo mensaje y coste temporal exista o no el usuario (anti-enumeración).
  const ok = row ? await verifyPassword(password, row.password_hash) : await burnPasswordCheck(password);
  if (!row || !ok) {
    console.warn(`[auth] Login fallido para email=${JSON.stringify(email)}`);
    throw AppError.unauthorized(CREDENCIALES_INVALIDAS);
  }

  const { token, expiresAt } = signAccessToken({ id: row.id, rol: row.rol });
  return {
    token,
    token_type: 'Bearer',
    expires_at: expiresAt.toISOString(),
    usuario: { id: row.id, nombre: row.nombre, email: row.email, rol: row.rol },
  };
}

export async function crearUsuario(input: CrearUsuarioInput, db?: Queryable): Promise<UsuarioPublico> {
  const passwordHash = await hashPassword(input.password);
  try {
    const { rows } = await query<UsuarioPublico>(
      `INSERT INTO usuario (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, rol, creado_en`,
      [input.nombre, input.email, passwordHash, input.rol satisfies Rol],
      db,
    );
    return rows[0]!;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw AppError.conflict('Ya existe un usuario con ese email');
    }
    throw err;
  }
}

export async function obtenerUsuario(id: number): Promise<UsuarioPublico> {
  const { rows } = await query<UsuarioPublico>(
    'SELECT id, nombre, email, rol, creado_en FROM usuario WHERE id = $1',
    [id],
  );
  if (!rows[0]) throw AppError.notFound('Usuario no encontrado');
  return rows[0];
}

export async function listarUsuarios(): Promise<UsuarioPublico[]> {
  const { rows } = await query<UsuarioPublico>(
    'SELECT id, nombre, email, rol, creado_en FROM usuario ORDER BY id',
  );
  return rows;
}
