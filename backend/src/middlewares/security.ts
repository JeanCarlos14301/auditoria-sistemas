import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

/**
 * Cabeceras de seguridad (OWASP A05). La API solo devuelve JSON, así que la CSP
 * puede ser la más restrictiva posible.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
});

/** CORS con lista blanca explícita (nunca `*`). Autenticación vía Bearer, sin cookies. */
export const corsPolicy = cors({
  origin(origin, callback) {
    // Peticiones sin Origin (curl, health checks, server-to-server) no están sujetas a CORS.
    if (!origin || env.CORS_ORIGIN.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
  credentials: false,
  maxAge: 600,
});

/** Las respuestas de la API contienen datos de auditoría sensibles: no cachear. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

/** Rechaza cuerpos que no sean JSON en métodos con cuerpo (evita parsers inesperados). */
export function requireJsonBody(req: Request, _res: Response, next: NextFunction): void {
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined;
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && hasBody && !req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type debe ser application/json');
  }
  next();
}
