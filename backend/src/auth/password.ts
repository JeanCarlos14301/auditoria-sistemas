import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';

/** bcrypt solo procesa los primeros 72 bytes: se rechazan contraseñas más largas. */
export const BCRYPT_MAX_BYTES = 72;

/**
 * Política de contraseñas (OWASP ASVS V2.1): mínimo 12 caracteres, máximo 72 bytes,
 * con mayúscula, minúscula, dígito y símbolo.
 */
export const passwordSchema = z
  .string()
  .min(12, 'La contraseña debe tener al menos 12 caracteres')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= BCRYPT_MAX_BYTES, {
    message: `La contraseña no puede superar ${BCRYPT_MAX_BYTES} bytes`,
  })
  .refine((v) => /[a-z]/.test(v), { message: 'Debe incluir al menos una minúscula' })
  .refine((v) => /[A-Z]/.test(v), { message: 'Debe incluir al menos una mayúscula' })
  .refine((v) => /\d/.test(v), { message: 'Debe incluir al menos un dígito' })
  .refine((v) => /[^A-Za-z0-9]/.test(v), { message: 'Debe incluir al menos un símbolo' });

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (Buffer.byteLength(plain, 'utf8') > BCRYPT_MAX_BYTES) return false;
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | null = null;

/**
 * Ejecuta una comparación bcrypt contra un hash ficticio cuando el usuario no existe,
 * igualando el tiempo de respuesta y evitando la enumeración de usuarios por timing.
 */
export async function burnPasswordCheck(plain: string): Promise<false> {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString('hex'), env.BCRYPT_ROUNDS);
  await bcrypt.compare(plain.slice(0, BCRYPT_MAX_BYTES), await dummyHash);
  return false;
}
