import type { NextFunction, Request, Response } from 'express';
import { query, type Queryable } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import type { AuditoriaRow, AuthUser } from '../types/domain.js';

export type RecursoAuditable = 'auditoria' | 'evaluacion' | 'hallazgo';

const COLUMNAS = `a.id, a.organizacion, a.alcance, a.fecha_inicio, a.fecha_fin,
                  a.id_auditor, a.estado, a.creado_en, a.actualizado_en`;

/** Resolución recurso -> auditoría propietaria (consultas fijas, parametrizadas). */
const RESOLVERS: Record<RecursoAuditable, string> = {
  auditoria: `SELECT ${COLUMNAS} FROM auditoria a WHERE a.id = $1`,
  evaluacion: `SELECT ${COLUMNAS}
                 FROM evaluacion_control ec
                 JOIN auditoria a ON a.id = ec.id_auditoria
                WHERE ec.id = $1`,
  hallazgo: `SELECT ${COLUMNAS}
               FROM hallazgo h
               JOIN evaluacion_control ec ON ec.id = h.id_evaluacion_control
               JOIN auditoria a ON a.id = ec.id_auditoria
              WHERE h.id = $1`,
};

const NO_ENCONTRADO: Record<RecursoAuditable, string> = {
  auditoria: 'Auditoría no encontrada',
  evaluacion: 'Evaluación no encontrada',
  hallazgo: 'Hallazgo no encontrado',
};

export const MENSAJE_AUDITORIA_CERRADA =
  'CP-13: La auditoría está CERRADA. Sus registros son inmutables y no admiten modificaciones.';

const POSITIVE_INT = /^[1-9]\d{0,9}$/;

export function parseIdParam(raw: unknown, name: string): number {
  if (typeof raw !== 'string' || !POSITIVE_INT.test(raw) || Number(raw) > 2_147_483_647) {
    throw AppError.badRequest(`Parámetro '${name}' inválido`);
  }
  return Number(raw);
}

/** ¿Puede este usuario operar sobre la auditoría? admin: todas; auditor: solo las propias. */
export function puedeAcceder(user: AuthUser, auditoria: Pick<AuditoriaRow, 'id_auditor'>): boolean {
  return user.rol === 'admin' || auditoria.id_auditor === user.id;
}

export async function resolverAuditoria(
  recurso: RecursoAuditable,
  id: number,
  db?: Queryable,
): Promise<AuditoriaRow | undefined> {
  const { rows } = await query<AuditoriaRow>(RESOLVERS[recurso], [id], db);
  return rows[0];
}

/**
 * Guard de auditoría inmutable (CP-13) + autorización a nivel de objeto (BOLA/IDOR).
 *
 *   router.patch('/evaluaciones/:id', requireAuth, immutableAudit('evaluacion'), ...)
 *
 * 1. Resuelve la auditoría propietaria del recurso `req.params[param]`.
 * 2. 404 si no existe o el usuario no tiene acceso (no revela existencia).
 * 3. 403 si la auditoría está CERRADA.
 * Deja `req.auditoria` y `req.resourceId` listos para el controlador.
 *
 * Los servicios vuelven a comprobar el estado dentro de su transacción con
 * `bloquearAuditoriaAbierta` (evita la carrera "verificar y luego escribir").
 */
export function immutableAudit(recurso: RecursoAuditable = 'auditoria', param = 'id') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const id = parseIdParam(req.params[param], param);

    const auditoria = await resolverAuditoria(recurso, id);
    if (!auditoria || !puedeAcceder(req.user, auditoria)) {
      throw AppError.notFound(NO_ENCONTRADO[recurso]);
    }
    if (auditoria.estado === 'CERRADA') {
      throw AppError.forbidden(MENSAJE_AUDITORIA_CERRADA);
    }

    req.auditoria = auditoria;
    req.resourceId = id;
    next();
  };
}

export function requireResourceId(req: Request): number {
  if (req.resourceId === undefined) throw new Error('immutableAudit no se ejecutó para esta ruta');
  return req.resourceId;
}
