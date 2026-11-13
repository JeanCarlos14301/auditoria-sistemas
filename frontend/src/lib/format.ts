import type { EstadoAuditoria, EstadoEvaluacion, FuenteEvidencia, Nivel, TipoAnomalia } from '../api/types';

const nf1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** 33.3 → "33,3 %". Solo da formato: el valor es el de la API. */
export const pct = (n: number): string => `${nf1.format(n)} %`;
/** "2026-11-30" o ISO → "30/11/2026". */
export const fecha = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
/** ISO-8601 UTC → "21:22:40 UTC". */
export const hora = (s: string): string => `${s.slice(11, 19)} UTC`;
export const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;
export const hoyISO = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const ESTADOS_AUDITORIA: readonly EstadoAuditoria[] = ['BORRADOR', 'EN_EJECUCION', 'EN_REVISION', 'CERRADA'];
export const ESTADOS_EVALUACION: readonly EstadoEvaluacion[] = ['IMPLEMENTADO', 'PARCIALMENTE_IMPLEMENTADO', 'NO_IMPLEMENTADO', 'NO_APLICABLE'];
export const FUENTES: readonly FuenteEvidencia[] = ['DOCUMENTAL', 'ENTREVISTA', 'OBSERVACION_TECNICA'];
export const NIVELES: readonly Nivel[] = ['ALTA', 'MEDIA', 'BAJA'];

export const NOMBRE_ESTADO: Record<EstadoAuditoria, string> = { BORRADOR: 'Borrador', EN_EJECUCION: 'En ejecución', EN_REVISION: 'En revisión', CERRADA: 'Cerrada' };
export const NOMBRE_EVALUACION: Record<EstadoEvaluacion, string> = { IMPLEMENTADO: 'Implementado', PARCIALMENTE_IMPLEMENTADO: 'Parcial', NO_IMPLEMENTADO: 'No implementado', NO_APLICABLE: 'No aplica' };
export const NOMBRE_FUENTE: Record<FuenteEvidencia, string> = { DOCUMENTAL: 'Documental', ENTREVISTA: 'Entrevista', OBSERVACION_TECNICA: 'Observación técnica' };
export const NOMBRE_NIVEL: Record<Nivel, string> = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };
export const ANOMALIA: Record<TipoAnomalia, { accion: string; resumen: string }> = {
  'CP-06_DISONANCIA_PROBATORIA': { accion: 'Registrar evidencia', resumen: 'Implementados sin evidencia' },
  CONTROL_SIN_HALLAZGO: { accion: 'Registrar hallazgo', resumen: 'Controles sin hallazgo' },
  'CP-08_HALLAZGO_HUERFANO': { accion: 'Registrar recomendación', resumen: 'Hallazgos sin recomendación' },
};

// Mensajes de las reglas CP-04 y CP-05, idénticos a los de la API (API.md, sección 2),
// para que la validación en el cliente (RNF03) diga lo mismo que diría el servidor.
export const MSG_CP04 = 'CP-04: Las observaciones analíticas son obligatorias para controles parciales o no implementados.';
export const MSG_CP05 = 'CP-05: Debe justificar explícitamente la exclusión de un control marcado como No Aplicable.';
/** Longitud mínima que la API exige a observaciones y justificación. */
export const MIN_TEXTO_EVALUACION = 5;

/** Comprobaciones del informe que devuelve la verificación de integridad (`informe.checks`). */
export const NOMBRE_CHECK: Record<string, string> = {
  eslabon_cierre_presente: 'El eslabón de cierre existe',
  eslabon_cierre_es_ultimo: 'El cierre es el último eslabón',
  snapshot_integro: 'El snapshot del informe no se ha alterado',
  metricas_consistentes: 'Las métricas coinciden con las selladas',
};
