import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
  /** Si es true, las respuestas < 400 no consumen cupo (solo cuentan los fallos). */
  skipSuccessfulRequests?: boolean;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Rate limiter en memoria de ventana fija (OWASP A07 / API4:2023).
 * Suficiente para una instancia única; con varias réplicas debe sustituirse
 * por un almacén compartido (p. ej. Redis).
 */
export function rateLimit({ windowMs, max, keyGenerator, message, skipSuccessfulRequests }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, windowMs);
  sweeper.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator ? keyGenerator(req) : (req.ip ?? 'unknown');
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(resetSeconds));
      throw AppError.tooManyRequests(message);
    }
    if (skipSuccessfulRequests) {
      const counted = bucket;
      res.on('finish', () => {
        if (res.statusCode < 400 && counted.count > 0) counted.count--;
      });
    }
    next();
  };
}

/** Límite general para toda la API. */
export const apiRateLimiter = rateLimit({ windowMs: 15 * 60_000, max: 1000 });

/**
 * Límite estricto para login: por IP + email, frena fuerza bruta y credential stuffing
 * contra una cuenta concreta sin bloquear a otros usuarios de la misma red.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 150) : '';
    return `${req.ip ?? 'unknown'}|${email}`;
  },
  message: 'Demasiados intentos de inicio de sesión. Intente de nuevo en unos minutos.',
  skipSuccessfulRequests: true,
});
