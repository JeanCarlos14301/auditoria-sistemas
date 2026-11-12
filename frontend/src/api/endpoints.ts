import { api } from './client';
import type {
  AuditoriaDetalle, AuditoriaListado, CambioEstado, CrearEvidenciaInput, CrearHallazgoInput, CrearRecomendacionInput,
  DiagnosticoTrazabilidad, EstadoAuditoria, InformeConVerificacion, EvaluarControlInput, Evaluacion, Evidencia, Hallazgo, Recomendacion,
  SesionLogin, Usuario, VerificacionIntegridad,
} from './types';

export const login = (email: string, password: string) => api<SesionLogin>('/auth/login', { method: 'POST', body: { email, password }, publica: true });
export const yo = () => api<Usuario>('/auth/me');

export const listarAuditorias = () => api<AuditoriaListado[]>('/auditorias');
export const detalleAuditoria = (id: number) => api<AuditoriaDetalle>(`/auditorias/${id}`);
export const trazabilidad = (id: number) => api<DiagnosticoTrazabilidad>(`/auditorias/${id}/trazabilidad`);
export const verificarIntegridad = (id: number) => api<VerificacionIntegridad>(`/auditorias/${id}/verificar-integridad`);
export const informe = (id: number) => api<InformeConVerificacion>(`/auditorias/${id}/informe`);
export const cambiarEstado = (id: number, estado: EstadoAuditoria) => api<CambioEstado>(`/auditorias/${id}/estado`, { method: 'PATCH', body: { estado } });

type EvaluacionPlana = Omit<Evaluacion, 'control' | 'evidencias' | 'hallazgos'>;
export const evaluarControl = (idEvaluacion: number, body: EvaluarControlInput) => api<EvaluacionPlana>(`/evaluaciones/${idEvaluacion}`, { method: 'PATCH', body });
export const crearEvidencia = (idEvaluacion: number, body: CrearEvidenciaInput) => api<Evidencia>(`/evaluaciones/${idEvaluacion}/evidencias`, { method: 'POST', body });
export const crearHallazgo = (idEvaluacion: number, body: CrearHallazgoInput) => api<Omit<Hallazgo, 'recomendaciones'>>(`/evaluaciones/${idEvaluacion}/hallazgos`, { method: 'POST', body });
export const crearRecomendacion = (idHallazgo: number, body: CrearRecomendacionInput) => api<Recomendacion>(`/hallazgos/${idHallazgo}/recomendaciones`, { method: 'POST', body });
