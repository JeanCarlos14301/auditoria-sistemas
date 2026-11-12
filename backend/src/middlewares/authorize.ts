import type { NextFunction, Request, Response } from 'express';
import type { Rol } from '../auth/jwt.js';
import { AppError } from '../errors/AppError.js';

/**
 * Guard RBAC (OWASP A01). Debe montarse DESPUÉS de `authenticate`.
 *   router.post('/usuarios', authenticate, requireRole('admin'), ...)
 */
export function requireRole(...allowed: [Rol, ...Rol[]]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw AppError.unauthorized();
    if (!allowed.includes(req.user.rol)) {
      throw AppError.forbidden('Su rol no tiene permisos para esta operación');
    }
    next();
  };
}
