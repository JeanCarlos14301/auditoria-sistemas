import type { NextFunction, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import type { AuditoriaRow, EstadoAuditoria } from '../types/domain.js';

const POSITIVE_INT = /^[1-9]\d{0,9}$/;

/**
 * Guard de autorización a nivel de objeto (OWASP A01 / API1:2023 BOLA-IDOR).
 *
 * Carga la auditoría indicada por `req.params[param]` y verifica:
 *   - admin  -> acceso a cualquier auditoría.
 *   - auditor -> solo a las auditorías donde es `id_auditor`.
 *
 * Responde 404 (no 403) cuando no hay acceso, para no revelar la existencia del recurso.
 * Nota: esta lectura es fuera de transacción; los servicios que cambian estado deben
 * volver a leer la fila con `SELECT ... FOR UPDATE` dentro de su transacción.
 */
export function loadAuditoria(param = 'idAuditoria') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();

    const raw = req.params[param];
    if (typeof raw !== 'string' || !POSITIVE_INT.test(raw) || Number(raw) > 2_147_483_647) {
      throw AppError.badRequest(`Parámetro '${param}' inválido`);
    }
    const id = Number(raw);

    const { rows } = await query<AuditoriaRow>(
      `SELECT id, organizacion, alcance, fecha_inicio, fecha_fin, id_auditor, estado, creado_en, actualizado_en
         FROM auditoria
        WHERE id = $1`,
      [id],
    );
    const auditoria = rows[0];

    if (!auditoria || (req.user.rol !== 'admin' && auditoria.id_auditor !== req.user.id)) {
      throw AppError.notFound('Auditoría no encontrada');
    }

    req.auditoria = auditoria;
    next();
  };
}

/**
 * Guard de máquina de estados: solo permite continuar si la auditoría está en uno de
 * los estados indicados. Debe montarse después de `loadAuditoria`.
 *   router.post('/:idAuditoria/evaluaciones', ..., requireAuditoriaEstado('EN_EJECUCION'), ...)
 */
export function requireAuditoriaEstado(...estados: [EstadoAuditoria, ...EstadoAuditoria[]]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auditoria = req.auditoria;
    if (!auditoria) throw new Error('requireAuditoriaEstado requiere loadAuditoria previo');
    if (!estados.includes(auditoria.estado)) {
      throw AppError.conflict(
        `Operación no permitida con la auditoría en estado ${auditoria.estado}`,
        { estado_actual: auditoria.estado, estados_permitidos: estados },
      );
    }
    next();
  };
}

/** Atajo: bloquea cualquier modificación sobre auditorías CERRADAS (registro inmutable). */
export const requireAuditoriaEditable = requireAuditoriaEstado('BORRADOR', 'EN_EJECUCION', 'EN_REVISION');

/** Obtiene la auditoría cargada por `loadAuditoria` o falla (error de programación). */
export function requireLoadedAuditoria(req: Request): AuditoriaRow {
  if (!req.auditoria) throw new Error('loadAuditoria no se ejecutó para esta ruta');
  return req.auditoria;
}
