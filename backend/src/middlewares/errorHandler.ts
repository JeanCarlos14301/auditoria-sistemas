import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { CanonicalizationError } from '../crypto/canonical.js';
import { AppError } from '../errors/AppError.js';

interface PgError extends Error {
  code: string;
  constraint?: string;
  detail?: string;
  table?: string;
}

function isPgError(err: unknown): err is PgError {
  if (!(err instanceof Error) || !('severity' in err)) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
}

interface BodyParserError extends Error {
  type?: string;
}

/** Traduce errores de PostgreSQL a respuestas HTTP sin filtrar SQL ni datos internos. */
function fromPgError(err: PgError): AppError | null {
  switch (err.code) {
    case '23505':
      return AppError.conflict('El registro ya existe (violación de unicidad)', { constraint: err.constraint });
    case '23503':
      return AppError.conflict('Referencia inválida o registro con dependencias', { constraint: err.constraint });
    case '23514':
      return AppError.unprocessable('Los datos violan una regla de negocio', { constraint: err.constraint });
    case '23502':
      return AppError.unprocessable('Falta un campo obligatorio');
    case '22P02':
    case '22007':
    case '22008':
      return AppError.badRequest('Formato de dato inválido');
    case '22001':
      return AppError.unprocessable('Un valor excede la longitud máxima permitida');
    case 'P0001':
      // RAISE EXCEPTION desde triggers (p. ej. inmutabilidad de la bitácora).
      return new AppError(409, 'INTEGRITY_VIOLATION', err.message);
    case '40001':
    case '40P01':
      return new AppError(503, 'RETRY', 'Conflicto de concurrencia, reintente la operación');
    case '57014':
      return new AppError(503, 'TIMEOUT', 'La operación excedió el tiempo máximo');
    default:
      return null;
  }
}

/**
 * Manejador global de errores (OWASP A05/A09): respuestas homogéneas,
 * sin stack traces ni detalles internos en producción, y log del lado servidor.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appErr: AppError;

  if (err instanceof AppError) {
    appErr = err;
  } else if (err instanceof ZodError) {
    appErr = AppError.badRequest(
      'Datos de entrada inválidos',
      err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    );
  } else if (err instanceof CanonicalizationError) {
    appErr = AppError.badRequest(err.message);
  } else if ((err as BodyParserError)?.type === 'entity.parse.failed') {
    appErr = AppError.badRequest('JSON mal formado');
  } else if ((err as BodyParserError)?.type === 'entity.too.large') {
    appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la solicitud es demasiado grande');
  } else if ((err as BodyParserError)?.type === 'encoding.unsupported' || (err as BodyParserError)?.type === 'charset.unsupported') {
    appErr = new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Codificación no soportada');
  } else if (isPgError(err) && fromPgError(err)) {
    appErr = fromPgError(err)!;
  } else {
    appErr = new AppError(500, 'INTERNAL_ERROR', 'Error interno del servidor');
  }

  if (appErr.status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const body: Record<string, unknown> = {
    error: appErr.message,
    code: appErr.code,
  };
  if (appErr.details !== undefined && (appErr.status < 500 || !isProduction)) {
    body.details = appErr.details;
  }
  if (appErr.extra) {
    for (const [k, v] of Object.entries(appErr.extra)) {
      if (!(k in body)) body[k] = v;
    }
  }

  if (res.headersSent) return;
  res.status(appErr.status).json(body);
}

export function notFoundHandler(req: Request, _res: Response): void {
  throw AppError.notFound(`Ruta no encontrada: ${req.method} ${req.path}`);
}
