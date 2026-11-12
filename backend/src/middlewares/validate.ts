import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

interface ValidationSchemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

/**
 * Validación y saneamiento de entrada con Zod (OWASP A03/A04).
 * Los datos parseados se guardan en `req.validated`; `req.body` también se sustituye por
 * la versión saneada (los objetos de Zod descartan claves desconocidas por defecto,
 * lo que previene mass-assignment). Los errores llegan al errorHandler como ZodError -> 400.
 *
 * Express 5: `req.query` es de solo lectura, por eso se usa `req.validated.query`.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const validated: NonNullable<Request['validated']> = {};
    if (schemas.params) validated.params = schemas.params.parse(req.params);
    if (schemas.query) validated.query = schemas.query.parse(req.query);
    if (schemas.body) {
      validated.body = schemas.body.parse(req.body ?? {});
      req.body = validated.body;
    }
    req.validated = validated;
    next();
  };
}

/** Lectura tipada de los datos validados. */
export function validated<S extends z.ZodType>(
  req: Request,
  part: 'body' | 'params' | 'query',
  _schema: S,
): z.infer<S> {
  if (!req.validated || !(part in req.validated)) {
    throw new Error(`validate({ ${part} }) no se ejecutó para esta ruta`);
  }
  return req.validated[part] as z.infer<S>;
}

/** Esquema reutilizable para IDs SERIAL en parámetros de ruta. */
export const idParam = z.coerce.number().int().positive().max(2_147_483_647);
