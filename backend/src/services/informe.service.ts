import { verifyAuditHashChain, type Eslabon, type ResultadoVerificacion } from '../crypto/hashChain.js';
import { safeEqualHex, verifyInformeHash } from '../crypto/hashing.js';
import { pool, type Queryable } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';

export interface InformeRow {
  id: number;
  id_auditoria: number;
  version: string;
  cumplimiento_pct: number;
  total_implementados: number;
  total_aplicables: number;
  total_no_aplicables: number;
  snapshot_json: Record<string, unknown>;
  hash_integridad: string;
  fecha_generacion: Date;
}

export interface VerificacionInforme {
  integro: boolean;
  checks: {
    eslabon_cierre_presente: boolean;
    eslabon_cierre_es_ultimo: boolean;
    snapshot_integro: boolean;
    metricas_consistentes: boolean;
  };
}

interface PayloadCierre {
  hash_snapshot?: string;
  cumplimiento_pct?: number;
  total_implementados?: number;
  total_aplicables?: number;
  total_no_aplicables?: number;
}

async function obtenerInformeRow(idAuditoria: number, db: Queryable): Promise<InformeRow | undefined> {
  const { rows } = await db.query<InformeRow>('SELECT * FROM informe WHERE id_auditoria = $1', [idAuditoria]);
  return rows[0];
}

/**
 * Verificación forense del informe:
 *  1. El eslabón CIERRE_INFORME cuyo hash es `informe.hash_integridad` existe en la cadena.
 *  2. Es el último eslabón (nada se añadió ni se truncó tras el cierre).
 *  3. El snapshot_json re-canonicalizado produce el hash_snapshot sellado en ese eslabón.
 *  4. Las columnas numéricas del informe coinciden con las selladas en el eslabón.
 */
function verificarInforme(informe: InformeRow, cadena: ResultadoVerificacion, eslabonCierre: Eslabon | undefined): VerificacionInforme {
  let payload: PayloadCierre = {};
  try {
    if (eslabonCierre) payload = JSON.parse(eslabonCierre.payload_canonico) as PayloadCierre;
  } catch {
    payload = {};
  }

  const checks = {
    eslabon_cierre_presente: eslabonCierre !== undefined,
    eslabon_cierre_es_ultimo: cadena.valida && safeEqualHex(cadena.ultimo_hash, informe.hash_integridad),
    snapshot_integro:
      typeof payload.hash_snapshot === 'string' && verifyInformeHash(informe.snapshot_json, payload.hash_snapshot),
    metricas_consistentes:
      payload.cumplimiento_pct === informe.cumplimiento_pct &&
      payload.total_implementados === informe.total_implementados &&
      payload.total_aplicables === informe.total_aplicables &&
      payload.total_no_aplicables === informe.total_no_aplicables,
  };
  return { integro: Object.values(checks).every(Boolean), checks };
}

async function obtenerEslabones(idAuditoria: number, db: Queryable): Promise<Eslabon[]> {
  const { rows } = await db.query<Eslabon>(
    `SELECT id, id_auditoria, id_usuario, tipo_evento, payload_canonico, hash_anterior, hash_actual, timestamp_utc
       FROM bitacora_hash_chain WHERE id_auditoria = $1 ORDER BY id`,
    [idAuditoria],
  );
  return rows;
}

/** GET /api/auditorias/:id/informe */
export async function obtenerInformeVerificado(idAuditoria: number, db: Queryable = pool) {
  const informe = await obtenerInformeRow(idAuditoria, db);
  if (!informe) {
    throw AppError.notFound('La auditoría aún no tiene informe: se genera automáticamente al cerrarla.');
  }
  const [cadena, eslabones] = await Promise.all([verifyAuditHashChain(idAuditoria, db), obtenerEslabones(idAuditoria, db)]);
  const cierre = eslabones.find((e) => e.tipo_evento === 'CIERRE_INFORME' && e.hash_actual === informe.hash_integridad);
  const verifInforme = verificarInforme(informe, cadena, cierre);

  return {
    informe,
    verificacion: {
      integra: cadena.valida && verifInforme.integro,
      cadena,
      informe: verifInforme,
    },
  };
}

/** GET /api/auditorias/:id/verificar-integridad */
export async function verificarIntegridadAuditoria(idAuditoria: number, db: Queryable = pool) {
  const [cadena, eslabones, informe] = await Promise.all([
    verifyAuditHashChain(idAuditoria, db),
    obtenerEslabones(idAuditoria, db),
    obtenerInformeRow(idAuditoria, db),
  ]);

  let verifInforme: VerificacionInforme | null = null;
  if (informe) {
    const cierre = eslabones.find((e) => e.tipo_evento === 'CIERRE_INFORME' && e.hash_actual === informe.hash_integridad);
    verifInforme = verificarInforme(informe, cadena, cierre);
  }

  return {
    id_auditoria: idAuditoria,
    integra: cadena.valida && (verifInforme?.integro ?? true),
    algoritmo: 'HMAC-SHA256',
    hash_final: cadena.ultimo_hash,
    cadena,
    informe: verifInforme,
    eslabones,
  };
}
