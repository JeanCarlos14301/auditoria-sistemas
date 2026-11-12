import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/jwt.js';
import { query } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import type { AuthUser } from '../types/domain.js';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/**
 * Guard de autenticación (OWASP A07).
 * - Exige `Authorization: Bearer <jwt>`.
 * - Verifica firma/alg/iss/aud/exp.
 * - Recarga el usuario desde BD: si fue eliminado o cambió de rol, el token deja de
 *   otorgar los privilegios antiguos (el rol efectivo es SIEMPRE el de la BD).
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.get('authorization');
  const match = header ? BEARER.exec(header) : null;

  if (!match) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="audita"');
    throw AppError.unauthorized('Token de acceso requerido');
  }

  let userId: number;
  try {
    userId = verifyAccessToken(match[1]!).userId;
  } catch {
    res.setHeader('WWW-Authenticate', 'Bearer realm="audita", error="invalid_token"');
    throw AppError.unauthorized('Token inválido o expirado');
  }

  const { rows } = await query<AuthUser>(
    'SELECT id, nombre, email, rol FROM usuario WHERE id = $1',
    [userId],
  );
  const user = rows[0];
  if (!user) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="audita", error="invalid_token"');
    throw AppError.unauthorized('Token inválido o expirado');
  }

  req.user = user;
  next();
}

/** Obtiene el usuario autenticado o lanza 401 (para usar en controladores tras `authenticate`). */
export function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

/** Alias con la nomenclatura de la especificación funcional. */
export const requireAuth = authenticate;
