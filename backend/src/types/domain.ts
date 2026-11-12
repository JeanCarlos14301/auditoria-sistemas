import type { Rol } from '../auth/jwt.js';

export const ESTADOS_AUDITORIA = ['BORRADOR', 'EN_EJECUCION', 'EN_REVISION', 'CERRADA'] as const;
export type EstadoAuditoria = (typeof ESTADOS_AUDITORIA)[number];

export const ESTADOS_EVALUACION = [
  'IMPLEMENTADO',
  'PARCIALMENTE_IMPLEMENTADO',
  'NO_IMPLEMENTADO',
  'NO_APLICABLE',
] as const;
export type EstadoEvaluacion = (typeof ESTADOS_EVALUACION)[number];

export const FUENTES_EVIDENCIA = ['DOCUMENTAL', 'ENTREVISTA', 'OBSERVACION_TECNICA'] as const;
export type FuenteEvidencia = (typeof FUENTES_EVIDENCIA)[number];

export const NIVELES = ['ALTA', 'MEDIA', 'BAJA'] as const;
export type Nivel = (typeof NIVELES)[number];

/** Límites normativos del alcance (RF02 / CP-03). */
export const MIN_CONTROLES_ALCANCE = 10;
export const MAX_CONTROLES_ALCANCE = 15;

/** Usuario autenticado adjuntado a `req.user` (nunca incluye password_hash). */
export interface AuthUser {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

export interface AuditoriaRow {
  id: number;
  organizacion: string;
  alcance: string;
  fecha_inicio: string;
  fecha_fin: string;
  id_auditor: number;
  estado: EstadoAuditoria;
  creado_en: Date;
  actualizado_en: Date;
}

export interface ControlISO {
  id: number;
  codigo_iso: string;
  clausula: number;
  categoria_tema: string;
  nombre: string;
  criterio_evaluacion: string;
  ejemplo_evidencia: string;
  attr_tipo_control: string;
  attr_propiedades_cia: string;
  attr_concepto_nist: string;
  attr_capacidad_operativa: string;
  attr_dominio_seguridad: string;
}

export interface EvaluacionRow {
  id: number;
  id_auditoria: number;
  id_control: number;
  estado: EstadoEvaluacion;
  observaciones: string | null;
  justificacion_na: string | null;
  evaluado_en: Date;
}

export interface Evidencia {
  id: number;
  id_evaluacion_control: number;
  descripcion: string;
  fuente: FuenteEvidencia;
  fecha_recoleccion: string;
  referencia_archivo: string | null;
  checksum_sha256: string | null;
  creado_en: Date;
}

export interface Recomendacion {
  id: number;
  id_hallazgo: number;
  descripcion: string;
  prioridad: Nivel;
  plazo_estimado: string;
  creado_en: Date;
}

export interface Hallazgo {
  id: number;
  id_evaluacion_control: number;
  condicion: string;
  criterio: string;
  causa: string;
  efecto_riesgo: string;
  severidad: Nivel;
  creado_en: Date;
}

export interface HallazgoDetalle extends Hallazgo {
  recomendaciones: Recomendacion[];
}

export interface EvaluacionDetalle extends EvaluacionRow {
  control: ControlISO;
  evidencias: Evidencia[];
  hallazgos: HallazgoDetalle[];
}

export interface ResumenMetricas {
  total_controles: number;
  implementados: number;
  parciales: number;
  no_implementados: number;
  no_aplicables: number;
  total_aplicables: number;
  cumplimiento_pct: number;
  hallazgos: { ALTA: number; MEDIA: number; BAJA: number; total: number };
}

export interface AuditoriaDetalle {
  auditoria: AuditoriaRow & { auditor_nombre: string };
  evaluaciones: EvaluacionDetalle[];
  metricas: ResumenMetricas;
}

export interface ValidatedRequestData {
  body?: unknown;
  params?: unknown;
  query?: unknown;
}
