import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';

export const ROLES = ['admin', 'auditor'] as const;
export type Rol = (typeof ROLES)[number];

const ISSUER = 'audita-api';
const AUDIENCE = 'audita-web';
/** Algoritmo fijado: impide ataques de confusión de algoritmo / `alg: none`. */
const ALGORITHM = 'HS256' as const;

const ClaimsSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  rol: z.enum(ROLES),
  jti: z.string().uuid(),
  iat: z.number(),
  exp: z.number(),
});

export interface TokenClaims {
  userId: number;
  rol: Rol;
  jti: string;
  expiresAt: Date;
}

export function signAccessToken(user: { id: number; rol: Rol }): { token: string; expiresAt: Date } {
  const token = jwt.sign({ rol: user.rol }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: String(user.id),
    issuer: ISSUER,
    audience: AUDIENCE,
    jwtid: randomUUID(),
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
  const { exp } = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Verifica firma, algoritmo, emisor, audiencia y expiración.
 * Lanza si el token es inválido; el llamador traduce el error a 401.
 */
export function verifyAccessToken(token: string): TokenClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
    clockTolerance: 5,
  });
  const claims = ClaimsSchema.parse(decoded);
  return {
    userId: Number(claims.sub),
    rol: claims.rol,
    jti: claims.jti,
    expiresAt: new Date(claims.exp * 1000),
  };
}
