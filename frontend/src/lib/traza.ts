import type { Evaluacion } from '../api/types';

/**
 * La traza de un control tiene tres tramos: evidencia, hallazgo y recomendación.
 * - ok: el eslabón existe.
 * - falta: el eslabón es obligatorio y no existe; la línea se corta aquí.
 * - pend: todavía no se puede exigir (una recomendación sin hallazgo previo); la línea ya venía cortada.
 * - no: ese eslabón no aplica a este control; la línea pasa de largo.
 *
 * Esto solo decide cómo se DIBUJA cada fila a partir del detalle de la auditoría.
 * Si la auditoría se puede cerrar o no lo dice la API (GET /trazabilidad), no esta función.
 */
export type Nodo = 'ok' | 'falta' | 'pend' | 'no';
export type Traza = [evidencia: Nodo, hallazgo: Nodo, recomendacion: Nodo];

type Respaldo = Pick<Evaluacion, 'estado'> & { evidencias: readonly unknown[]; hallazgos: readonly { recomendaciones: readonly unknown[] }[] };

export function nodosDe(e: Respaldo): Traza {
  if (e.estado === 'NO_APLICABLE') return ['no', 'no', 'no'];
  if (e.estado === 'IMPLEMENTADO') return [e.evidencias.length ? 'ok' : 'falta', 'no', 'no'];
  // Parcial o no implementado: exige hallazgo, y cada hallazgo exige recomendación.
  const hayHallazgo = e.hallazgos.length > 0;
  const todasConRecomendacion = e.hallazgos.every(h => h.recomendaciones.length > 0);
  return [e.evidencias.length ? 'ok' : 'no', hayHallazgo ? 'ok' : 'falta', !hayHallazgo ? 'pend' : todasConRecomendacion ? 'ok' : 'falta'];
}

const corta = (n: Nodo): boolean => n === 'falta' || n === 'pend';
/** Para cada tramo, si la línea llega viva hasta él (ningún corte antes ni en él). */
export function tramosVivos(t: Traza): [boolean, boolean, boolean] {
  const a = !corta(t[0]), b = a && !corta(t[1]), c = b && !corta(t[2]);
  return [a, b, c];
}
export const trazaCompleta = (t: Traza): boolean => !t.some(corta);
