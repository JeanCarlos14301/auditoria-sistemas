// Tipos del contrato de la API (backend/API.md). No añadir campos que la API no envíe.

export type Rol = 'admin' | 'auditor';
export type EstadoAuditoria = 'BORRADOR' | 'EN_EJECUCION' | 'EN_REVISION' | 'CERRADA';
export type EstadoEvaluacion = 'IMPLEMENTADO' | 'PARCIALMENTE_IMPLEMENTADO' | 'NO_IMPLEMENTADO' | 'NO_APLICABLE';
export type FuenteEvidencia = 'DOCUMENTAL' | 'ENTREVISTA' | 'OBSERVACION_TECNICA';
export type Nivel = 'ALTA' | 'MEDIA' | 'BAJA';

export interface Usuario { id: number; nombre: string; email: string; rol: Rol; creado_en?: string }

export interface SesionLogin { token: string; token_type: 'Bearer'; expires_at: string; usuario: Usuario }

export interface Auditoria {
  id: number;
  organizacion: string;
  alcance: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
  id_auditor: number;
  estado: EstadoAuditoria;
  creado_en: string;
  actualizado_en: string;
}

export interface AuditoriaListado extends Auditoria {
  auditor_nombre: string;
  total_controles: number;
  cumplimiento_pct: number;
}

export interface ControlISO {
  id: number;
  codigo_iso: string;
  clausula: 5 | 6 | 7 | 8;
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

export interface Evidencia {
  id: number;
  id_evaluacion_control: number;
  descripcion: string;
  fuente: FuenteEvidencia;
  fecha_recoleccion: string; // YYYY-MM-DD
  referencia_archivo: string | null;
  checksum_sha256: string | null;
  creado_en: string;
}

export interface Recomendacion {
  id: number;
  id_hallazgo: number;
  descripcion: string;
  prioridad: Nivel;
  plazo_estimado: string;
  creado_en: string;
}

export interface Hallazgo {
  id: number;
  id_evaluacion_control: number;
  condicion: string;
  criterio: string;
  causa: string;
  efecto_riesgo: string;
  severidad: Nivel;
  creado_en: string;
  recomendaciones: Recomendacion[];
}

export interface Evaluacion {
  id: number;
  id_auditoria: number;
  id_control: number;
  estado: EstadoEvaluacion;
  observaciones: string | null;
  justificacion_na: string | null;
  evaluado_en: string;
  control: ControlISO;
  evidencias: Evidencia[];
  hallazgos: Hallazgo[];
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
  auditoria: Auditoria & { auditor_nombre: string };
  evaluaciones: Evaluacion[];
  metricas: ResumenMetricas;
}

export type TipoAnomalia = 'CP-06_DISONANCIA_PROBATORIA' | 'CONTROL_SIN_HALLAZGO' | 'CP-08_HALLAZGO_HUERFANO';

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

export interface Informe {
  id: number;
  id_auditoria: number;
  version: string;
  cumplimiento_pct: number;
  total_implementados: number;
  total_aplicables: number;
  total_no_aplicables: number;
  hash_integridad: string;
  fecha_generacion: string;
}

export interface RupturaCadena { id_eslabon: number; posicion: number; motivo: string; esperado: string; encontrado: string }

export interface VerificacionCadena {
  id_auditoria: number;
  valida: boolean;
  total_eslabones: number;
  eslabones_verificados: number;
  ultimo_hash: string;
  ruptura: RupturaCadena | null;
  verificado_en: string;
}

/** GET /auditorias/:id/verificar-integridad. `informe` es null mientras la auditoría no está cerrada. */
export interface VerificacionIntegridad {
  id_auditoria: number;
  integra: boolean;
  algoritmo: string;
  hash_final: string;
  cadena: VerificacionCadena;
  informe: { integro: boolean; checks: Record<string, boolean> } | null;
  eslabones: Eslabon[];
}

export interface CambioEstado { auditoria: Auditoria; informe: Informe | null }

/** Cuerpo de cualquier error de la API. `details` puede ser [{campo, mensaje}] en errores de validación. */
export interface CuerpoError {
  error: string;
  code?: string;
  details?: unknown;
  anomalias?: Anomalia[];
  total_anomalias?: number;
}

export interface EvaluarControlInput { estado: EstadoEvaluacion; observaciones?: string | null; justificacion_na?: string | null }
export interface CrearEvidenciaInput { descripcion: string; fuente: FuenteEvidencia; fecha_recoleccion?: string; referencia_archivo?: string | null }
export interface CrearHallazgoInput { condicion: string; criterio?: string | null; causa: string; efecto_riesgo: string; severidad: Nivel }
export interface CrearRecomendacionInput { descripcion: string; prioridad: Nivel; plazo_estimado: string }

/** GET /auditorias/:id/informe (solo con la auditoría cerrada). */
export interface InformeConVerificacion { informe: Informe; verificacion: Omit<VerificacionIntegridad, 'eslabones' | 'algoritmo' | 'hash_final' | 'id_auditoria'> }

export interface CrearAuditoriaInput { organizacion: string; alcance: string; fecha_inicio: string; fecha_fin: string }
/** POST /auditorias/:id/alcance */
export interface AlcanceDefinido { auditoria: Auditoria; total_controles: number }
