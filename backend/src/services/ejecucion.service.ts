import { appendHashChainEvent } from '../crypto/hashChain.js';
import { sha256Hex } from '../crypto/hashing.js';
import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import type {
  CrearEvidenciaInput,
  CrearHallazgoInput,
  CrearRecomendacionInput,
  EvaluarControlInput,
} from '../schemas/ejecucion.schemas.js';
import type { AuthUser, EvaluacionRow, Evidencia, Hallazgo, Recomendacion } from '../types/domain.js';
import { bloquearAuditoriaAbierta } from './auditoria.service.js';

export const MENSAJE_CP04 =
  'CP-04: Las observaciones analíticas son obligatorias para controles parciales o no implementados.';
export const MENSAJE_CP05 =
  'CP-05: Debe justificar explícitamente la exclusión de un control marcado como No Aplicable.';

const MIN_TEXTO_ANALITICO = 5;

/** Reglas de negocio CP-04 / CP-05 (los mensajes son parte del contrato con el Frontend). */
export function validarReglasEvaluacion(input: EvaluarControlInput): void {
  if (input.estado === 'PARCIALMENTE_IMPLEMENTADO' || input.estado === 'NO_IMPLEMENTADO') {
    if ((input.observaciones?.trim().length ?? 0) < MIN_TEXTO_ANALITICO) {
      throw AppError.badRequest(MENSAJE_CP04);
    }
  }
  if (input.estado === 'NO_APLICABLE') {
    if ((input.justificacion_na?.trim().length ?? 0) < MIN_TEXTO_ANALITICO) {
      throw AppError.badRequest(MENSAJE_CP05);
    }
  }
}

interface EvaluacionConControl extends EvaluacionRow {
  codigo_iso: string;
  control_nombre: string;
  criterio_evaluacion: string;
}

async function bloquearEvaluacion(
  client: DbClient,
  idEvaluacion: number,
  lock: 'FOR UPDATE' | 'FOR SHARE',
): Promise<EvaluacionConControl> {
  const { rows } = await client.query<EvaluacionConControl>(
    `SELECT ec.id, ec.id_auditoria, ec.id_control, ec.estado, ec.observaciones, ec.justificacion_na,
            ec.evaluado_en, c.codigo_iso, c.nombre AS control_nombre, c.criterio_evaluacion
       FROM evaluacion_control ec
       JOIN control c ON c.id = ec.id_control
      WHERE ec.id = $1
      ${lock} OF ec`,
    [idEvaluacion],
  );
  if (!rows[0]) throw AppError.notFound('Evaluación no encontrada');
  return rows[0];
}

/** RF03 — PATCH /api/evaluaciones/:id */
export async function evaluarControl(
  idAuditoria: number,
  idEvaluacion: number,
  input: EvaluarControlInput,
  user: AuthUser,
): Promise<EvaluacionRow> {
  validarReglasEvaluacion(input);

  const observaciones = input.observaciones ?? null;
  // La justificación de exclusión solo tiene sentido en NO_APLICABLE.
  const justificacionNa = input.estado === 'NO_APLICABLE' ? (input.justificacion_na ?? null) : null;

  return withTransaction(async (client) => {
    await bloquearAuditoriaAbierta(client, idAuditoria, 'SHARE');
    const anterior = await bloquearEvaluacion(client, idEvaluacion, 'FOR UPDATE');

    const { rows } = await client.query<EvaluacionRow>(
      `UPDATE evaluacion_control
          SET estado = $2, observaciones = $3, justificacion_na = $4, evaluado_en = NOW()
        WHERE id = $1
        RETURNING id, id_auditoria, id_control, estado, observaciones, justificacion_na, evaluado_en`,
      [idEvaluacion, input.estado, observaciones, justificacionNa],
    );
    const evaluacion = rows[0]!;

    await appendHashChainEvent(client, {
      idAuditoria,
      idUsuario: user.id,
      tipoEvento: 'EVALUACION_CONTROL',
      payload: {
        id_evaluacion: idEvaluacion,
        id_control: anterior.id_control,
        codigo_iso: anterior.codigo_iso,
        estado_anterior: anterior.estado,
        estado: evaluacion.estado,
        observaciones: evaluacion.observaciones,
        justificacion_na: evaluacion.justificacion_na,
      },
    });
    return evaluacion;
  });
}

/** RF04 — POST /api/evaluaciones/:id/evidencias */
export async function registrarEvidencia(
  idAuditoria: number,
  idEvaluacion: number,
  input: CrearEvidenciaInput,
  user: AuthUser,
): Promise<Evidencia> {
  const checksum = sha256Hex(`${input.descripcion}|${input.fuente}|${input.referencia_archivo || ''}`);

  return withTransaction(async (client) => {
    await bloquearAuditoriaAbierta(client, idAuditoria, 'SHARE');
    const evaluacion = await bloquearEvaluacion(client, idEvaluacion, 'FOR SHARE');

    const { rows } = await client.query<Evidencia>(
      `INSERT INTO evidencia (id_evaluacion_control, descripcion, fuente, fecha_recoleccion, referencia_archivo, checksum_sha256)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
       RETURNING *`,
      [idEvaluacion, input.descripcion, input.fuente, input.fecha_recoleccion ?? null, input.referencia_archivo, checksum],
    );
    const evidencia = rows[0]!;

    await appendHashChainEvent(client, {
      idAuditoria,
      idUsuario: user.id,
      tipoEvento: 'REGISTRO_EVIDENCIA',
      payload: {
        id_evidencia: evidencia.id,
        id_evaluacion: idEvaluacion,
        codigo_iso: evaluacion.codigo_iso,
        descripcion: evidencia.descripcion,
        fuente: evidencia.fuente,
        fecha_recoleccion: evidencia.fecha_recoleccion,
        referencia_archivo: evidencia.referencia_archivo,
        checksum_sha256: checksum,
      },
    });
    return evidencia;
  });
}

/** RF05 — POST /api/evaluaciones/:id/hallazgos (estructura ISO 19011:2018). */
export async function registrarHallazgo(
  idAuditoria: number,
  idEvaluacion: number,
  input: CrearHallazgoInput,
  user: AuthUser,
): Promise<Hallazgo> {
  return withTransaction(async (client) => {
    await bloquearAuditoriaAbierta(client, idAuditoria, 'SHARE');
    const evaluacion = await bloquearEvaluacion(client, idEvaluacion, 'FOR SHARE');

    // Criterio de auditoría por defecto: el requisito del control ISO evaluado.
    const criterio =
      input.criterio ??
      `ISO/IEC 27002:2022 – Control ${evaluacion.codigo_iso} (${evaluacion.control_nombre}): ${evaluacion.criterio_evaluacion}`;

    const { rows } = await client.query<Hallazgo>(
      `INSERT INTO hallazgo (id_evaluacion_control, condicion, criterio, causa, efecto_riesgo, severidad)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [idEvaluacion, input.condicion, criterio, input.causa, input.efecto_riesgo, input.severidad],
    );
    const hallazgo = rows[0]!;

    await appendHashChainEvent(client, {
      idAuditoria,
      idUsuario: user.id,
      tipoEvento: 'REGISTRO_HALLAZGO',
      payload: {
        id_hallazgo: hallazgo.id,
        id_evaluacion: idEvaluacion,
        codigo_iso: evaluacion.codigo_iso,
        condicion: hallazgo.condicion,
        criterio: hallazgo.criterio,
        causa: hallazgo.causa,
        efecto_riesgo: hallazgo.efecto_riesgo,
        severidad: hallazgo.severidad,
        criterio_autocompletado: input.criterio === null,
      },
    });
    return hallazgo;
  });
}

/** RF06 — POST /api/hallazgos/:id/recomendaciones */
export async function registrarRecomendacion(
  idAuditoria: number,
  idHallazgo: number,
  input: CrearRecomendacionInput,
  user: AuthUser,
): Promise<Recomendacion> {
  return withTransaction(async (client) => {
    await bloquearAuditoriaAbierta(client, idAuditoria, 'SHARE');

    const hallazgo = await client.query<{ id: number; id_evaluacion_control: number }>(
      'SELECT id, id_evaluacion_control FROM hallazgo WHERE id = $1 FOR SHARE',
      [idHallazgo],
    );
    if (!hallazgo.rows[0]) throw AppError.notFound('Hallazgo no encontrado');

    const { rows } = await client.query<Recomendacion>(
      `INSERT INTO recomendacion (id_hallazgo, descripcion, prioridad, plazo_estimado)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [idHallazgo, input.descripcion, input.prioridad, input.plazo_estimado],
    );
    const recomendacion = rows[0]!;

    await appendHashChainEvent(client, {
      idAuditoria,
      idUsuario: user.id,
      tipoEvento: 'REGISTRO_RECOMENDACION',
      payload: {
        id_recomendacion: recomendacion.id,
        id_hallazgo: idHallazgo,
        id_evaluacion: hallazgo.rows[0].id_evaluacion_control,
        descripcion: recomendacion.descripcion,
        prioridad: recomendacion.prioridad,
        plazo_estimado: recomendacion.plazo_estimado,
      },
    });
    return recomendacion;
  });
}
