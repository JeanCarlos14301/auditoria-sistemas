import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { canonicalize } from './canonical.js';

const HEX64 = /^[0-9a-f]{64}$/;

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && HEX64.test(value);
}

/** SHA-256 en hexadecimal (64 caracteres). Uso: checksum de evidencias. */
export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * HMAC-SHA256 con la clave de la organización (ORG_HMAC_SECRET).
 * A diferencia de un SHA-256 simple, un atacante con acceso de escritura a la BD
 * no puede recalcular hashes válidos sin conocer la clave.
 */
export function orgHmacHex(data: string): string {
  return createHmac('sha256', env.ORG_HMAC_SECRET).update(data, 'utf8').digest('hex');
}

/** Comparación en tiempo constante de dos digests hex de 64 caracteres. */
export function safeEqualHex(a: string, b: string): boolean {
  if (!isSha256Hex(a) || !isSha256Hex(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Prefijo de dominio: evita que un hash de informe pueda confundirse con uno de la bitácora. */
const INFORME_DOMAIN = 'AUDITA/INFORME/v1';

/** Hash de integridad para `informe.hash_integridad` a partir del snapshot. */
export function computeInformeHash(snapshot: unknown): string {
  return orgHmacHex(`${INFORME_DOMAIN}\n${canonicalize(snapshot)}`);
}

/**
 * Verifica un informe almacenado. Se re-canonicaliza el snapshot leído de JSONB
 * (JSONB no preserva el orden de claves, por eso se hashea la forma canónica).
 */
export function verifyInformeHash(snapshot: unknown, storedHash: string): boolean {
  return safeEqualHex(computeInformeHash(snapshot), storedHash);
}
