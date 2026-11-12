/**
 * Motor de Hash Chain (bitácora forense append-only) — una cadena por auditoría.
 *
 *   hash_actual = HMAC-SHA256(ORG_HMAC_SECRET, canonical({
 *       v, id_auditoria, id_usuario, tipo_evento, timestamp_utc, hash_anterior, payload_canonico
 *   }))
 *
 * - El primer eslabón de cada auditoría encadena contra GENESIS_HASH (64 ceros).
 * - Cada eslabón incluye el hash del anterior: modificar, borrar o reordenar cualquier
 *   registro rompe todos los posteriores.
 * - La serialización del sobre es JSON canónico, así no hay ambigüedad de delimitadores.
 * - La inmutabilidad en BD la refuerzan los triggers de `bitacora_hash_chain`
 *   (UPDATE/DELETE/TRUNCATE bloqueados).
 * - La concurrencia se serializa por auditoría con `pg_advisory_xact_lock`, de modo que
 *   dos transacciones no pueden leer el mismo "último hash" y bifurcar la cadena.
 */
import { canonicalize, type CanonicalValue } from './canonical.js';
import { orgHmacHex, safeEqualHex } from './hashing.js';
import { pool, type DbClient, type Queryable } from '../db/pool.js';

export const GENESIS_HASH = '0'.repeat(64);
const CHAIN_VERSION = 1;
/** Espacio de nombres del advisory lock (evita colisiones con otros locks de la app). */
const ADVISORY_LOCK_NAMESPACE = 27002;

export const TIPOS_EVENTO = [
  'CREACION_AUDITORIA',
  'ALCANCE_DEFINIDO',
  'EVALUACION_CONTROL',
  'REGISTRO_EVIDENCIA',
  'REGISTRO_HALLAZGO',
  'REGISTRO_RECOMENDACION',
  'CAMBIO_ESTADO',
  'CIERRE_INFORME',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export interface EslabonInput {
  idAuditoria: number;
  idUsuario: number;
  tipoEvento: TipoEvento;
  payload: CanonicalValue;
}

export interface Eslabon {
  id: number;
  id_auditoria: number;
  id_usuario: number;
  tipo_evento: string;
  payload_canonico: string;
  hash_anterior: string;
  hash_actual: string;
  timestamp_utc: string;
}

interface HashMaterial {
  id_auditoria: number;
  id_usuario: number;
  tipo_evento: string;
  timestamp_utc: string;
  hash_anterior: string;
  payload_canonico: string;
}

/** Función pura de cálculo del hash de un eslabón. */
export function computeLinkHash(m: HashMaterial): string {
  const envelope = canonicalize({
    v: CHAIN_VERSION,
    id_auditoria: m.id_auditoria,
    id_usuario: m.id_usuario,
    tipo_evento: m.tipo_evento,
    timestamp_utc: m.timestamp_utc,
    hash_anterior: m.hash_anterior,
    payload_canonico: m.payload_canonico,
  });
  return orgHmacHex(envelope);
}

/**
 * Añade un eslabón a la cadena de la auditoría.
 *
 * DEBE ejecutarse con un cliente dentro de una transacción (ver `withTransaction`),
 * idealmente la misma que realiza el cambio de negocio: así el evento y el cambio
 * se confirman o revierten juntos.
 */
export async function appendEslabon(client: DbClient, input: EslabonInput): Promise<Eslabon> {
  if (!TIPOS_EVENTO.includes(input.tipoEvento)) {
    throw new Error(`tipo_evento no permitido: ${String(input.tipoEvento)}`);
  }

  // Lock exclusivo por auditoría hasta el fin de la transacción.
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [
    ADVISORY_LOCK_NAMESPACE,
    input.idAuditoria,
  ]);

  const last = await client.query<{ hash_actual: string }>(
    `SELECT hash_actual
       FROM bitacora_hash_chain
      WHERE id_auditoria = $1
      ORDER BY id DESC
      LIMIT 1`,
    [input.idAuditoria],
  );

  const hashAnterior = last.rows[0]?.hash_actual ?? GENESIS_HASH;
  const payloadCanonico = canonicalize(input.payload);
  const timestampUtc = new Date().toISOString();

  const hashActual = computeLinkHash({
    id_auditoria: input.idAuditoria,
    id_usuario: input.idUsuario,
    tipo_evento: input.tipoEvento,
    timestamp_utc: timestampUtc,
    hash_anterior: hashAnterior,
    payload_canonico: payloadCanonico,
  });

  const inserted = await client.query<Eslabon>(
    `INSERT INTO bitacora_hash_chain
       (id_auditoria, id_usuario, tipo_evento, payload_canonico, hash_anterior, hash_actual, timestamp_utc)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, id_auditoria, id_usuario, tipo_evento, payload_canonico,
               hash_anterior, hash_actual, timestamp_utc`,
    [
      input.idAuditoria,
      input.idUsuario,
      input.tipoEvento,
      payloadCanonico,
      hashAnterior,
      hashActual,
      timestampUtc,
    ],
  );

  return inserted.rows[0]!;
}

export type MotivoRuptura =
  | 'ENLACE_ROTO' // hash_anterior no coincide con el hash_actual del eslabón previo
  | 'HASH_INVALIDO' // el contenido del eslabón no produce su hash_actual
  | 'PAYLOAD_NO_CANONICO'; // payload_canonico no está en forma canónica

export interface ResultadoVerificacion {
  id_auditoria: number;
  valida: boolean;
  total_eslabones: number;
  eslabones_verificados: number;
  ultimo_hash: string;
  ruptura: null | {
    id_eslabon: number;
    posicion: number;
    motivo: MotivoRuptura;
    esperado: string;
    encontrado: string;
  };
  verificado_en: string;
}

/**
 * Recorre la cadena completa de una auditoría y recalcula cada eslabón.
 * Se detiene en la primera ruptura. Una cadena vacía es válida (ultimo_hash = GENESIS).
 *
 * Nota: el truncado de la cola de la cadena no es detectable solo con la cadena; por eso
 * el informe final debe anclar `ultimo_hash` dentro de su snapshot firmado.
 */
export async function verificarCadena(
  idAuditoria: number,
  db: Queryable = pool,
): Promise<ResultadoVerificacion> {
  const { rows } = await db.query<Eslabon>(
    `SELECT id, id_auditoria, id_usuario, tipo_evento, payload_canonico,
            hash_anterior, hash_actual, timestamp_utc
       FROM bitacora_hash_chain
      WHERE id_auditoria = $1
      ORDER BY id ASC`,
    [idAuditoria],
  );

  let previo = GENESIS_HASH;
  let verificados = 0;
  let ruptura: ResultadoVerificacion['ruptura'] = null;

  for (const [i, e] of rows.entries()) {
    if (!safeEqualHex(e.hash_anterior, previo)) {
      ruptura = { id_eslabon: e.id, posicion: i + 1, motivo: 'ENLACE_ROTO', esperado: previo, encontrado: e.hash_anterior };
      break;
    }

    let canonicoOk = false;
    try {
      canonicoOk = canonicalize(JSON.parse(e.payload_canonico)) === e.payload_canonico;
    } catch {
      canonicoOk = false;
    }
    if (!canonicoOk) {
      ruptura = { id_eslabon: e.id, posicion: i + 1, motivo: 'PAYLOAD_NO_CANONICO', esperado: 'JSON canónico', encontrado: 'no canónico' };
      break;
    }

    const recalculado = computeLinkHash(e);
    if (!safeEqualHex(recalculado, e.hash_actual)) {
      ruptura = { id_eslabon: e.id, posicion: i + 1, motivo: 'HASH_INVALIDO', esperado: recalculado, encontrado: e.hash_actual };
      break;
    }

    previo = e.hash_actual;
    verificados++;
  }

  return {
    id_auditoria: idAuditoria,
    valida: ruptura === null,
    total_eslabones: rows.length,
    eslabones_verificados: verificados,
    // Con ruptura: último hash íntegro antes del punto de ruptura.
    ultimo_hash: previo,
    ruptura,
    verificado_en: new Date().toISOString(),
  };
}

/** Último hash de la cadena (GENESIS si está vacía). Útil para anclarlo en el informe. */
export async function obtenerUltimoHash(idAuditoria: number, db: Queryable = pool): Promise<string> {
  const { rows } = await db.query<{ hash_actual: string }>(
    `SELECT hash_actual FROM bitacora_hash_chain WHERE id_auditoria = $1 ORDER BY id DESC LIMIT 1`,
    [idAuditoria],
  );
  return rows[0]?.hash_actual ?? GENESIS_HASH;
}

/** Alias con la nomenclatura de la especificación funcional. */
export const appendHashChainEvent = appendEslabon;
export const verifyAuditHashChain = verificarCadena;
