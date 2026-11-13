// Reproduce una auditoría a partir de su bitácora.
// Cada eslabón guarda el evento completo (payload_canonico), así que el estado de la auditoría
// tras cualquier evento se puede reconstruir sin pedir nada más a la API.
import type { EstadoAuditoria, EstadoEvaluacion } from '../api/types';
import type { Traza } from './traza';

export interface EventoBitacora { tipo_evento: string; payload_canonico: string; hash_actual: string; timestamp_utc: string }

export interface ControlEnElTiempo {
  /** null: está en el alcance pero todavía no se ha evaluado. */
  estado: EstadoEvaluacion | null;
  evidencias: number;
  /** Recomendaciones de cada hallazgo, por id de hallazgo. */
  hallazgos: Record<string, number>;
}
export interface Instantanea {
  estado: EstadoAuditoria | null;
  /** Controles del alcance, por código ISO, en el orden en que se definió. */
  controles: Record<string, ControlEnElTiempo>;
  /** Control al que afecta el evento que llevó a esta instantánea. */
  toca: string | null;
}

type Carga = Record<string, unknown>;
const leer = (texto: string): Carga => { try { const v: unknown = JSON.parse(texto); return v && typeof v === 'object' ? (v as Carga) : {}; } catch { return {}; } };
const texto = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' ? String(v) : null);

/**
 * Devuelve eventos.length + 1 instantáneas: la [0] es "antes del primer evento" y la [k] es el estado tras el evento k.
 * Un evento que no se entiende (tipo desconocido o contenido incompleto) no cambia nada: la reproducción nunca falla.
 */
export function reproducir(eventos: readonly EventoBitacora[]): Instantanea[] {
  const salida: Instantanea[] = [{ estado: null, controles: {}, toca: null }];
  const controlDelHallazgo: Record<string, string> = {};
  let estado: EstadoAuditoria | null = null;
  let controles: Record<string, ControlEnElTiempo> = {};

  for (const e of eventos) {
    const p = leer(e.payload_canonico);
    const codigo = texto(p.codigo_iso);
    let toca: string | null = null;
    // Copia: cada instantánea es independiente de las demás
    controles = Object.fromEntries(Object.entries(controles).map(([k, v]) => [k, { ...v, hallazgos: { ...v.hallazgos } }]));

    switch (e.tipo_evento) {
      case 'CREACION_AUDITORIA': estado = (texto(p.estado) as EstadoAuditoria | null) ?? 'BORRADOR'; break;
      case 'ALCANCE_DEFINIDO':
        if (Array.isArray(p.codigos_iso)) for (const c of p.codigos_iso) { const k = texto(c); if (k) controles[k] = { estado: null, evidencias: 0, hallazgos: {} }; }
        estado = (texto(p.estado_nuevo) as EstadoAuditoria | null) ?? estado;
        break;
      case 'EVALUACION_CONTROL': if (codigo && controles[codigo]) { controles[codigo].estado = texto(p.estado) as EstadoEvaluacion; toca = codigo; } break;
      case 'REGISTRO_EVIDENCIA': if (codigo && controles[codigo]) { controles[codigo].evidencias++; toca = codigo; } break;
      case 'REGISTRO_HALLAZGO': {
        const id = texto(p.id_hallazgo);
        if (codigo && id && controles[codigo]) { controles[codigo].hallazgos[id] = 0; controlDelHallazgo[id] = codigo; toca = codigo; }
        break;
      }
      case 'REGISTRO_RECOMENDACION': {
        const id = texto(p.id_hallazgo), c = id ? controlDelHallazgo[id] : undefined;
        if (id && c && controles[c]) { controles[c].hallazgos[id] = (controles[c].hallazgos[id] ?? 0) + 1; toca = c; }
        break;
      }
      default: estado = (texto(p.estado_nuevo) as EstadoAuditoria | null) ?? estado;   // CAMBIO_ESTADO, CIERRE_INFORME
    }
    salida.push({ estado, controles, toca });
  }
  return salida;
}

/** La traza de un control en un momento de la historia (misma lectura que lib/traza.ts). */
export function trazaEnElTiempo(c: ControlEnElTiempo | undefined): Traza {
  if (!c || c.estado === null) return ['pend', 'no', 'no'];
  if (c.estado === 'NO_APLICABLE') return ['no', 'no', 'no'];
  if (c.estado === 'IMPLEMENTADO') return [c.evidencias ? 'ok' : 'falta', 'no', 'no'];
  const recs = Object.values(c.hallazgos);
  return [c.evidencias ? 'ok' : 'no', recs.length ? 'ok' : 'falta', !recs.length ? 'pend' : recs.every(n => n > 0) ? 'ok' : 'falta'];
}

const NOMBRE: Record<string, string> = { IMPLEMENTADO: 'Implementado', PARCIALMENTE_IMPLEMENTADO: 'Parcial', NO_IMPLEMENTADO: 'No implementado', NO_APLICABLE: 'No aplica', BORRADOR: 'Borrador', EN_EJECUCION: 'En ejecución', EN_REVISION: 'En revisión', CERRADA: 'Cerrada', ALTA: 'alta', MEDIA: 'media', BAJA: 'baja' };
const nombre = (v: unknown): string => { const t = texto(v); return t ? NOMBRE[t] ?? t : ''; };

/** Una frase legible para cada evento. `despues` es la instantánea que deja el evento. */
export function fraseDe(e: EventoBitacora, despues: Instantanea, pct: (n: number) => string): string {
  const p = leer(e.payload_canonico);
  switch (e.tipo_evento) {
    case 'CREACION_AUDITORIA': return 'Se crea la auditoría, en Borrador';
    case 'ALCANCE_DEFINIDO': return `Se define el alcance: ${Object.keys(despues.controles).length} controles`;
    case 'EVALUACION_CONTROL': return `Se evalúa el control ${texto(p.codigo_iso) ?? ''}: ${nombre(p.estado)}`;
    case 'REGISTRO_EVIDENCIA': return `Se registra una evidencia del control ${texto(p.codigo_iso) ?? ''}`;
    case 'REGISTRO_HALLAZGO': return `Hallazgo en el control ${texto(p.codigo_iso) ?? ''}, severidad ${nombre(p.severidad)}`;
    case 'REGISTRO_RECOMENDACION': return `Recomendación para el hallazgo del control ${despues.toca ?? ''}`;
    case 'CAMBIO_ESTADO': return `La auditoría pasa a ${nombre(p.estado_nuevo)}`;
    case 'CIERRE_INFORME': return typeof p.cumplimiento_pct === 'number' ? `Se cierra con un cumplimiento del ${pct(p.cumplimiento_pct)}` : 'Se cierra la auditoría';
    default: return e.tipo_evento;
  }
}
