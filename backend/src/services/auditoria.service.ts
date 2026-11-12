import { appendHashChainEvent, obtenerUltimoHash } from '../crypto/hashChain.js';
import { computeInformeHash } from '../crypto/hashing.js';
import { pool, withTransaction, type DbClient, type Queryable } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import { MENSAJE_AUDITORIA_CERRADA } from '../middlewares/immutableAudit.js';
import type { CrearAuditoriaInput } from '../schemas/auditoria.schemas.js';
import {
  MAX_CONTROLES_ALCANCE,
  MIN_CONTROLES_ALCANCE,
  type AuditoriaDetalle,
  type AuditoriaRow,
  type AuthUser,
  type ControlISO,
  type EstadoAuditoria,
  type EvaluacionDetalle,
  type EvaluacionRow,
  type Evidencia,
  type Hallazgo,
  type HallazgoDetalle,
  type Recomendacion,
} from '../types/domain.js';
import { calcularMetricasAuditoria, validarTrazabilidadPreCierre } from './metricas.service.js';

const COLUMNAS_AUDITORIA = `a.id, a.organizacion, a.alcance, a.fecha_inicio, a.fecha_fin,
                            a.id_auditor, a.estado, a.creado_en, a.actualizado_en`;

export const MENSAJE_CP03 =
  'CP-03: El alcance normativo exige seleccionar estrictamente entre 10 y 15 controles ISO/IEC 27002:2022.';
export const MENSAJE_BLOQUEO_CIERRE = 'Bloqueo de cierre por anomalías de trazabilidad (CP-06 / CP-08)';

/** Máquina de estados de la auditoría. BORRADOR -> EN_EJECUCION solo vía POST /alcance. */
const TRANSICIONES: Record<EstadoAuditoria, readonly EstadoAuditoria[]> = {
  BORRADOR: [],
  EN_EJECUCION: ['EN_REVISION', 'CERRADA'],
  EN_REVISION: ['EN_EJECUCION', 'CERRADA'],
  CERRADA: [],
};

/**
 * Re-lee y bloquea la fila de la auditoría DENTRO de la transacción y vuelve a
 * comprobar que no esté CERRADA (cierra la ventana de carrera tras `immutableAudit`).
 *  - 'SHARE'  : mutaciones de registros hijos (pueden ejecutarse en paralelo entre sí).
 *  - 'UPDATE' : cambios de estado/alcance (exclusivo; espera a las mutaciones en curso).
 * Orden de locks en toda la app: fila de auditoría -> advisory lock de la cadena.
 */
export async function bloquearAuditoriaAbierta(
  client: DbClient,
  idAuditoria: number,
  modo: 'SHARE' | 'UPDATE',
): Promise<AuditoriaRow> {
  const lock = modo === 'UPDATE' ? 'FOR UPDATE' : 'FOR SHARE';
  const { rows } = await client.query<AuditoriaRow>(
    `SELECT ${COLUMNAS_AUDITORIA} FROM auditoria a WHERE a.id = $1 ${lock}`,
    [idAuditoria],
  );
  const auditoria = rows[0];
  if (!auditoria) throw AppError.notFound('Auditoría no encontrada');
  if (auditoria.estado === 'CERRADA') throw AppError.forbidden(MENSAJE_AUDITORIA_CERRADA);
  return auditoria;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export interface AuditoriaListado extends AuditoriaRow {
  auditor_nombre: string;
  total_controles: number;
  cumplimiento_pct: number;
}

/** GET /api/auditorias — admin ve todas; auditor solo las propias. */
export async function listarAuditorias(user: AuthUser): Promise<AuditoriaListado[]> {
  const { rows } = await pool.query<AuditoriaListado>(
    `SELECT ${COLUMNAS_AUDITORIA},
            u.nombre AS auditor_nombre,
            COUNT(ec.id)::int AS total_controles,
            COALESCE(
                ROUND(
                    100.0 * SUM(CASE WHEN ec.estado = 'IMPLEMENTADO' THEN 1 ELSE 0 END)
                    / NULLIF(SUM(CASE WHEN ec.estado <> 'NO_APLICABLE' THEN 1 ELSE 0 END), 0),
                1),
            0.0)::float AS cumplimiento_pct
       FROM auditoria a
       JOIN usuario u ON u.id = a.id_auditor
       LEFT JOIN evaluacion_control ec ON ec.id_auditoria = a.id
      WHERE ($1::int IS NULL OR a.id_auditor = $1)
      GROUP BY a.id, u.nombre
      ORDER BY a.creado_en DESC, a.id DESC`,
    [user.rol === 'admin' ? null : user.id],
  );
  return rows;
}

/**
 * GET /api/auditorias/:id — detalle completo con la estructura que consume el Frontend:
 * auditoria + evaluaciones[{ control, evidencias[], hallazgos[{ recomendaciones[] }] }] + metricas.
 */
export async function obtenerDetalleAuditoria(idAuditoria: number, db: Queryable = pool): Promise<AuditoriaDetalle> {
  const auditoriaRes = await db.query<AuditoriaDetalle['auditoria']>(
    `SELECT ${COLUMNAS_AUDITORIA}, u.nombre AS auditor_nombre
       FROM auditoria a JOIN usuario u ON u.id = a.id_auditor
      WHERE a.id = $1`,
    [idAuditoria],
  );
  const auditoria = auditoriaRes.rows[0];
  if (!auditoria) throw AppError.notFound('Auditoría no encontrada');

  // Secuencial: `db` puede ser un cliente de transacción (no admite consultas concurrentes).
  const evaluaciones = await db.query<EvaluacionRow & { control: ControlISO }>(
      `SELECT ec.id, ec.id_auditoria, ec.id_control, ec.estado, ec.observaciones,
              ec.justificacion_na, ec.evaluado_en, to_jsonb(c) AS control
         FROM evaluacion_control ec
         JOIN control c ON c.id = ec.id_control
        WHERE ec.id_auditoria = $1
        ORDER BY c.clausula, split_part(c.codigo_iso, '.', 2)::int`,
    [idAuditoria],
  );
  const evidencias = await db.query<Evidencia>(
    `SELECT e.* FROM evidencia e
       JOIN evaluacion_control ec ON ec.id = e.id_evaluacion_control
      WHERE ec.id_auditoria = $1 ORDER BY e.id`,
    [idAuditoria],
  );
  const hallazgos = await db.query<Hallazgo>(
    `SELECT h.* FROM hallazgo h
       JOIN evaluacion_control ec ON ec.id = h.id_evaluacion_control
      WHERE ec.id_auditoria = $1 ORDER BY h.id`,
    [idAuditoria],
  );
  const recomendaciones = await db.query<Recomendacion>(
    `SELECT r.* FROM recomendacion r
       JOIN hallazgo h ON h.id = r.id_hallazgo
       JOIN evaluacion_control ec ON ec.id = h.id_evaluacion_control
      WHERE ec.id_auditoria = $1 ORDER BY r.id`,
    [idAuditoria],
  );
  const metricas = await calcularMetricasAuditoria(idAuditoria, db);

  const recsPorHallazgo = agrupar(recomendaciones.rows, (r) => r.id_hallazgo);
  const hallazgosDetalle: HallazgoDetalle[] = hallazgos.rows.map((h) => ({
    ...h,
    recomendaciones: recsPorHallazgo.get(h.id) ?? [],
  }));
  const evidenciasPorEval = agrupar(evidencias.rows, (e) => e.id_evaluacion_control);
  const hallazgosPorEval = agrupar(hallazgosDetalle, (h) => h.id_evaluacion_control);

  const evaluacionesDetalle: EvaluacionDetalle[] = evaluaciones.rows.map((ev) => ({
    ...ev,
    evidencias: evidenciasPorEval.get(ev.id) ?? [],
    hallazgos: hallazgosPorEval.get(ev.id) ?? [],
  }));

  return { auditoria, evaluaciones: evaluacionesDetalle, metricas };
}

function agrupar<T>(items: T[], key: (item: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

/** RF01 — POST /api/auditorias (CP-01: nace en BORRADOR). */
export async function crearAuditoria(input: CrearAuditoriaInput, user: AuthUser): Promise<AuditoriaRow> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<AuditoriaRow>(
      `INSERT INTO auditoria (organizacion, alcance, fecha_inicio, fecha_fin, id_auditor, estado)
       VALUES ($1, $2, $3, $4, $5, 'BORRADOR')
       RETURNING id, organizacion, alcance, fecha_inicio, fecha_fin, id_auditor, estado, creado_en, actualizado_en`,
      [input.organizacion, input.alcance, input.fecha_inicio, input.fecha_fin, user.id],
    );
    const auditoria = rows[0]!;

    await appendHashChainEvent(client, {
      idAuditoria: auditoria.id,
      idUsuario: user.id,
      tipoEvento: 'CREACION_AUDITORIA',
      payload: {
        id_auditoria: auditoria.id,
        organizacion: auditoria.organizacion,
        alcance: auditoria.alcance,
        fecha_inicio: auditoria.fecha_inicio,
        fecha_fin: auditoria.fecha_fin,
        id_auditor: auditoria.id_auditor,
        estado: auditoria.estado,
      },
    });
    return auditoria;
  });
}

/** Normaliza y valida el alcance (CP-03): sin duplicados, entre 10 y 15 controles. */
export function normalizarAlcance(ids: number[]): number[] {
  const unicos = Array.from(new Set(ids));
  if (unicos.length < MIN_CONTROLES_ALCANCE || unicos.length > MAX_CONTROLES_ALCANCE) {
    throw AppError.badRequest(MENSAJE_CP03, { recibidos: unicos.length, minimo: MIN_CONTROLES_ALCANCE, maximo: MAX_CONTROLES_ALCANCE });
  }
  return unicos.sort((a, b) => a - b);
}

/**
 * RF02 — POST /api/auditorias/:id/alcance.
 * Solo en BORRADOR: una vez iniciada la ejecución, cambiar el alcance destruiría
 * evaluaciones, evidencias y hallazgos ya registrados.
 */
export async function definirAlcance(idAuditoria: number, idsControles: number[], user: AuthUser) {
  return withTransaction(async (client) => {
    const auditoria = await bloquearAuditoriaAbierta(client, idAuditoria, 'UPDATE');
    if (auditoria.estado !== 'BORRADOR') {
      throw AppError.conflict(
        `El alcance solo puede definirse con la auditoría en BORRADOR (estado actual: ${auditoria.estado}).`,
      );
    }

    const controles = await client.query<{ id: number; codigo_iso: string }>(
      'SELECT id, codigo_iso FROM control WHERE id = ANY($1::int[]) ORDER BY id',
      [idsControles],
    );
    if (controles.rows.length !== idsControles.length) {
      const existentes = new Set(controles.rows.map((c) => c.id));
      throw AppError.badRequest('Uno o más controles no existen en el catálogo ISO/IEC 27002:2022', {
        ids_inexistentes: idsControles.filter((id) => !existentes.has(id)),
      });
    }

    // Limpia asignaciones previas (en BORRADOR no existen registros hijos que perder).
    await client.query('DELETE FROM evaluacion_control WHERE id_auditoria = $1', [idAuditoria]);
    const evaluaciones = await client.query<EvaluacionRow>(
      `INSERT INTO evaluacion_control (id_auditoria, id_control, estado)
       SELECT $1, id_control, 'NO_IMPLEMENTADO' FROM unnest($2::int[]) AS t(id_control)
       RETURNING id, id_auditoria, id_control, estado, observaciones, justificacion_na, evaluado_en`,
      [idAuditoria, idsControles],
    );

    const actualizada = await client.query<AuditoriaRow>(
      `UPDATE auditoria SET estado = 'EN_EJECUCION', actualizado_en = NOW() WHERE id = $1
       RETURNING id, organizacion, alcance, fecha_inicio, fecha_fin, id_auditor, estado, creado_en, actualizado_en`,
      [idAuditoria],
    );

    await appendHashChainEvent(client, {
      idAuditoria,
      idUsuario: user.id,
      tipoEvento: 'ALCANCE_DEFINIDO',
      payload: {
        id_auditoria: idAuditoria,
        ids_controles: idsControles,
        codigos_iso: controles.rows.map((c) => c.codigo_iso),
        total_controles: idsControles.length,
        estado_anterior: auditoria.estado,
        estado_nuevo: 'EN_EJECUCION',
      },
    });

    return {
      auditoria: actualizada.rows[0]!,
      total_controles: evaluaciones.rows.length,
      evaluaciones: evaluaciones.rows,
    };
  });
}

/** RF08 — PATCH /api/auditorias/:id/estado. */
export async function cambiarEstado(idAuditoria: number, nuevoEstado: EstadoAuditoria, user: AuthUser) {
  return withTransaction(async (client) => {
    const auditoria = await bloquearAuditoriaAbierta(client, idAuditoria, 'UPDATE');

    if (auditoria.estado === nuevoEstado) {
      throw AppError.conflict(`La auditoría ya está en estado ${nuevoEstado}.`);
    }
    if (!TRANSICIONES[auditoria.estado].includes(nuevoEstado)) {
      const pista = auditoria.estado === 'BORRADOR' ? ' Defina el alcance (POST /alcance) para iniciar la ejecución.' : '';
      throw AppError.conflict(`Transición no permitida: ${auditoria.estado} -> ${nuevoEstado}.${pista}`, {
        estado_actual: auditoria.estado,
        transiciones_permitidas: TRANSICIONES[auditoria.estado],
      });
    }

    if (nuevoEstado === 'CERRADA') return cerrarAuditoria(client, auditoria, user);

    const { rows } = await client.query<AuditoriaRow>(
      `UPDATE auditoria SET estado = $2, actualizado_en = NOW() WHERE id = $1
       RETURNING id, organizacion, alcance, fecha_inicio, fecha_fin, id_auditor, estado, creado_en, actualizado_en`,
      [idAuditoria, nuevoEstado],
    );
    await appendHashChainEvent(client, {
      idAuditoria,
      idUsuario: user.id,
      tipoEvento: 'CAMBIO_ESTADO',
      payload: { id_auditoria: idAuditoria, estado_anterior: auditoria.estado, estado_nuevo: nuevoEstado },
    });
    return { auditoria: rows[0]!, informe: null };
  });
}

/**
 * Cierre con validación transversal y generación del informe inmutable.
 * Se ejecuta con la fila de la auditoría bloqueada FOR UPDATE: ninguna mutación
 * concurrente puede colarse entre la validación y el sellado.
 */
async function cerrarAuditoria(client: DbClient, auditoria: AuditoriaRow, user: AuthUser) {
  const idAuditoria = auditoria.id;

  // 1. Alcance normativo 10–15 controles.
  const { rows: conteo } = await client.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM evaluacion_control WHERE id_auditoria = $1',
    [idAuditoria],
  );
  const totalControles = conteo[0]!.total;
  if (totalControles < MIN_CONTROLES_ALCANCE || totalControles > MAX_CONTROLES_ALCANCE) {
    throw AppError.unprocessable(
      `No se puede cerrar: el alcance tiene ${totalControles} controles y debe tener entre ${MIN_CONTROLES_ALCANCE} y ${MAX_CONTROLES_ALCANCE}.`,
    );
  }

  // 2. Trazabilidad (CP-06 / CP-08).
  const diagnostico = await validarTrazabilidadPreCierre(idAuditoria, client);
  if (diagnostico.anomalias.length > 0) {
    throw AppError.unprocessable(MENSAJE_BLOQUEO_CIERRE, undefined, {
      total_anomalias: diagnostico.total_anomalias,
      resumen: diagnostico.resumen,
      anomalias: diagnostico.anomalias,
    });
  }

  // 3. Snapshot completo + métricas finales, anclado al último hash de la cadena.
  const detalle = await obtenerDetalleAuditoria(idAuditoria, client);
  const fechaCierre = new Date().toISOString();
  const snapshot = JSON.parse(
    JSON.stringify({
      version_snapshot: 1,
      marco_normativo: ['ISO/IEC 27002:2022', 'ISO 19011:2018'],
      fecha_cierre: fechaCierre,
      cerrado_por: { id: user.id, nombre: user.nombre, rol: user.rol },
      hash_cadena_previo: await obtenerUltimoHash(idAuditoria, client),
      auditoria: { ...detalle.auditoria, estado: 'CERRADA' },
      metricas: detalle.metricas,
      evaluaciones: detalle.evaluaciones,
    }),
  ) as Record<string, unknown>;
  const hashSnapshot = computeInformeHash(snapshot);
  const m = detalle.metricas;

  // 4. Eslabón CIERRE_INFORME (vincula el hash del snapshot a la cadena).
  const eslabon = await appendHashChainEvent(client, {
    idAuditoria,
    idUsuario: user.id,
    tipoEvento: 'CIERRE_INFORME',
    payload: {
      id_auditoria: idAuditoria,
      estado_anterior: auditoria.estado,
      estado_nuevo: 'CERRADA',
      version_informe: '1.0',
      cumplimiento_pct: m.cumplimiento_pct,
      total_implementados: m.implementados,
      total_aplicables: m.total_aplicables,
      total_no_aplicables: m.no_aplicables,
      hash_snapshot: hashSnapshot,
    },
  });

  // 5. Informe consolidado con hash_integridad = hash_actual del eslabón de cierre.
  const informe = await client.query(
    `INSERT INTO informe (id_auditoria, version, cumplimiento_pct, total_implementados, total_aplicables,
                          total_no_aplicables, snapshot_json, hash_integridad)
     VALUES ($1, '1.0', $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING id, id_auditoria, version, cumplimiento_pct, total_implementados, total_aplicables,
               total_no_aplicables, hash_integridad, fecha_generacion`,
    [idAuditoria, m.cumplimiento_pct, m.implementados, m.total_aplicables, m.no_aplicables, JSON.stringify(snapshot), eslabon.hash_actual],
  );

  // 6. Sellado de la auditoría.
  const cerrada = await client.query<AuditoriaRow>(
    `UPDATE auditoria SET estado = 'CERRADA', actualizado_en = NOW() WHERE id = $1
     RETURNING id, organizacion, alcance, fecha_inicio, fecha_fin, id_auditor, estado, creado_en, actualizado_en`,
    [idAuditoria],
  );

  return { auditoria: cerrada.rows[0]!, informe: { ...informe.rows[0], hash_snapshot: hashSnapshot } };
}
