import { pool, type Queryable } from '../db/pool.js';
import type { EstadoEvaluacion, Nivel, ResumenMetricas } from '../types/domain.js';

/**
 * RF07 / CP-09 — Motor matemático de cumplimiento.
 *
 *   cumplimiento_pct = ROUND(100 × IMPLEMENTADO / (total − NO_APLICABLE), 1)
 *
 * - NO_APLICABLE se excluye del denominador.
 * - PARCIALMENTE_IMPLEMENTADO pondera 0 en el numerador.
 * - Sin controles aplicables -> 0.0 (NULLIF evita la división por cero).
 */
const SQL_METRICAS = `
SELECT
    COUNT(*)::int AS total_controles,
    COALESCE(SUM(CASE WHEN estado = 'IMPLEMENTADO' THEN 1 ELSE 0 END), 0)::int AS implementados,
    COALESCE(SUM(CASE WHEN estado = 'PARCIALMENTE_IMPLEMENTADO' THEN 1 ELSE 0 END), 0)::int AS parciales,
    COALESCE(SUM(CASE WHEN estado = 'NO_IMPLEMENTADO' THEN 1 ELSE 0 END), 0)::int AS no_implementados,
    COALESCE(SUM(CASE WHEN estado = 'NO_APLICABLE' THEN 1 ELSE 0 END), 0)::int AS no_aplicables,
    COALESCE(SUM(CASE WHEN estado <> 'NO_APLICABLE' THEN 1 ELSE 0 END), 0)::int AS total_aplicables,
    COALESCE(
        ROUND(
            100.0 * SUM(CASE WHEN estado = 'IMPLEMENTADO' THEN 1 ELSE 0 END)
            / NULLIF(SUM(CASE WHEN estado <> 'NO_APLICABLE' THEN 1 ELSE 0 END), 0),
        1),
    0.0)::float AS cumplimiento_pct
FROM evaluacion_control
WHERE id_auditoria = $1`;

const SQL_HALLAZGOS_SEVERIDAD = `
SELECT h.severidad, COUNT(*)::int AS total
  FROM hallazgo h
  JOIN evaluacion_control ec ON ec.id = h.id_evaluacion_control
 WHERE ec.id_auditoria = $1
 GROUP BY h.severidad`;

export async function calcularMetricasAuditoria(
  idAuditoria: number,
  db: Queryable = pool,
): Promise<ResumenMetricas> {
  // Secuencial: `db` puede ser un cliente de transacción.
  const metricas = await db.query<Omit<ResumenMetricas, 'hallazgos'>>(SQL_METRICAS, [idAuditoria]);
  const severidades = await db.query<{ severidad: Nivel; total: number }>(SQL_HALLAZGOS_SEVERIDAD, [idAuditoria]);

  const hallazgos = { ALTA: 0, MEDIA: 0, BAJA: 0, total: 0 };
  for (const { severidad, total } of severidades.rows) {
    hallazgos[severidad] = total;
    hallazgos.total += total;
  }

  return { ...metricas.rows[0]!, hallazgos };
}

// ---------------------------------------------------------------------------
// RNF05 — Validador transversal de trazabilidad pre-cierre (CP-06 / CP-08)
// ---------------------------------------------------------------------------

export type TipoAnomalia =
  | 'CP-06_DISONANCIA_PROBATORIA' // IMPLEMENTADO sin evidencias
  | 'CONTROL_SIN_HALLAZGO' // PARCIAL / NO_IMPLEMENTADO sin hallazgos
  | 'CP-08_HALLAZGO_HUERFANO'; // hallazgo sin recomendaciones

export interface Anomalia {
  tipo: TipoAnomalia;
  id_evaluacion: number;
  id_hallazgo?: number;
  codigo_iso: string;
  control: string;
  estado: EstadoEvaluacion;
  mensaje: string;
}

export interface DiagnosticoTrazabilidad {
  id_auditoria: number;
  apta_para_cierre: boolean;
  total_anomalias: number;
  resumen: Record<TipoAnomalia, number>;
  anomalias: Anomalia[];
}

/**
 * Cruce jerárquico evaluacion_control -> control -> evidencia / hallazgo.
 * COUNT(DISTINCT ...) evita la multiplicación de filas del doble LEFT JOIN.
 */
const SQL_TRAZABILIDAD_CONTROLES = `
SELECT ec.id AS id_evaluacion,
       ec.estado,
       c.codigo_iso,
       c.nombre AS control,
       COUNT(DISTINCT e.id)::int AS total_evidencias,
       COUNT(DISTINCT h.id)::int AS total_hallazgos
  FROM evaluacion_control ec
  JOIN control c        ON c.id = ec.id_control
  LEFT JOIN evidencia e ON e.id_evaluacion_control = ec.id
  LEFT JOIN hallazgo h  ON h.id_evaluacion_control = ec.id
 WHERE ec.id_auditoria = $1
 GROUP BY ec.id, ec.estado, c.codigo_iso, c.nombre, c.clausula
 ORDER BY c.clausula, split_part(c.codigo_iso, '.', 2)::int`;

/** Cruce hallazgo -> recomendacion: hallazgos con 0 recomendaciones. */
const SQL_HALLAZGOS_HUERFANOS = `
SELECT h.id AS id_hallazgo,
       ec.id AS id_evaluacion,
       ec.estado,
       c.codigo_iso,
       c.nombre AS control
  FROM hallazgo h
  JOIN evaluacion_control ec ON ec.id = h.id_evaluacion_control
  JOIN control c             ON c.id = ec.id_control
  LEFT JOIN recomendacion r  ON r.id_hallazgo = h.id
 WHERE ec.id_auditoria = $1
 GROUP BY h.id, ec.id, ec.estado, c.codigo_iso, c.nombre
HAVING COUNT(r.id) = 0
 ORDER BY h.id`;

export async function validarTrazabilidadPreCierre(
  idAuditoria: number,
  db: Queryable = pool,
): Promise<DiagnosticoTrazabilidad> {
  const controles = await db.query<{
    id_evaluacion: number;
    estado: EstadoEvaluacion;
    codigo_iso: string;
    control: string;
    total_evidencias: number;
    total_hallazgos: number;
  }>(SQL_TRAZABILIDAD_CONTROLES, [idAuditoria]);
  const huerfanos = await db.query<{
    id_hallazgo: number;
    id_evaluacion: number;
    estado: EstadoEvaluacion;
    codigo_iso: string;
    control: string;
  }>(SQL_HALLAZGOS_HUERFANOS, [idAuditoria]);

  const anomalias: Anomalia[] = [];

  for (const r of controles.rows) {
    const base = { id_evaluacion: r.id_evaluacion, codigo_iso: r.codigo_iso, control: r.control, estado: r.estado };
    if (r.estado === 'IMPLEMENTADO' && r.total_evidencias === 0) {
      anomalias.push({
        ...base,
        tipo: 'CP-06_DISONANCIA_PROBATORIA',
        mensaje: `Control ${r.codigo_iso} declarado IMPLEMENTADO sin ninguna evidencia que lo respalde.`,
      });
    }
    if ((r.estado === 'PARCIALMENTE_IMPLEMENTADO' || r.estado === 'NO_IMPLEMENTADO') && r.total_hallazgos === 0) {
      anomalias.push({
        ...base,
        tipo: 'CONTROL_SIN_HALLAZGO',
        mensaje: `Control ${r.codigo_iso} en estado ${r.estado} sin hallazgo documentado (ISO 19011).`,
      });
    }
  }

  for (const h of huerfanos.rows) {
    anomalias.push({
      tipo: 'CP-08_HALLAZGO_HUERFANO',
      id_evaluacion: h.id_evaluacion,
      id_hallazgo: h.id_hallazgo,
      codigo_iso: h.codigo_iso,
      control: h.control,
      estado: h.estado,
      mensaje: `Hallazgo #${h.id_hallazgo} del control ${h.codigo_iso} no tiene ninguna recomendación asociada.`,
    });
  }

  const resumen: Record<TipoAnomalia, number> = {
    'CP-06_DISONANCIA_PROBATORIA': 0,
    CONTROL_SIN_HALLAZGO: 0,
    'CP-08_HALLAZGO_HUERFANO': 0,
  };
  for (const a of anomalias) resumen[a.tipo]++;

  return {
    id_auditoria: idAuditoria,
    apta_para_cierre: anomalias.length === 0,
    total_anomalias: anomalias.length,
    resumen,
    anomalias,
  };
}
