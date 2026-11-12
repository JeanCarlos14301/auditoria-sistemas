import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ep from './endpoints';
import type { ApiError } from './client';
// El cliente (api/client.ts) solo lanza ApiError, así que ese es el tipo de error de toda consulta y mutación.
declare module '@tanstack/react-query' {
  interface Register { defaultError: ApiError }
}

import type { CrearEvidenciaInput, CrearHallazgoInput, CrearRecomendacionInput, EstadoAuditoria, EvaluarControlInput } from './types';

// Todo lo que depende de una auditoría cuelga de ['auditoria', id]: cada mutación lo invalida entero,
// porque la API pide recargar el detalle (y con él las métricas) después de cualquier cambio.
const clave = {
  lista: ['auditorias'] as const,
  auditoria: (id: number) => ['auditoria', id] as const,
  detalle: (id: number) => ['auditoria', id, 'detalle'] as const,
  trazabilidad: (id: number) => ['auditoria', id, 'trazabilidad'] as const,
  integridad: (id: number) => ['auditoria', id, 'integridad'] as const,
  informe: (id: number) => ['auditoria', id, 'informe'] as const,
};

export const useAuditorias = () => useQuery({ queryKey: clave.lista, queryFn: ep.listarAuditorias });
export const useAuditoria = (id: number) => useQuery({ queryKey: clave.detalle(id), queryFn: () => ep.detalleAuditoria(id), enabled: Number.isInteger(id) && id > 0 });
export const useTrazabilidad = (id: number, activa: boolean) => useQuery({ queryKey: clave.trazabilidad(id), queryFn: () => ep.trazabilidad(id), enabled: activa });
export const useIntegridad = (id: number, activa: boolean) => useQuery({ queryKey: clave.integridad(id), queryFn: () => ep.verificarIntegridad(id), enabled: activa });
export const useInforme = (id: number, activa: boolean) => useQuery({ queryKey: clave.informe(id), queryFn: () => ep.informe(id), enabled: activa });

function useMutacionDeAuditoria<TVars, TData>(idAuditoria: number, fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn: fn,
    // Se espera a que el detalle esté recargado: así el formulario se cierra con los datos ya actualizados.
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: clave.auditoria(idAuditoria) });
      void qc.invalidateQueries({ queryKey: clave.lista });
    },
  });
}

export const useEvaluar = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (v: { idEvaluacion: number; body: EvaluarControlInput }) => ep.evaluarControl(v.idEvaluacion, v.body));
export const useCrearEvidencia = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (v: { idEvaluacion: number; body: CrearEvidenciaInput }) => ep.crearEvidencia(v.idEvaluacion, v.body));
export const useCrearHallazgo = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (v: { idEvaluacion: number; body: CrearHallazgoInput }) => ep.crearHallazgo(v.idEvaluacion, v.body));
export const useCrearRecomendacion = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (v: { idHallazgo: number; body: CrearRecomendacionInput }) => ep.crearRecomendacion(v.idHallazgo, v.body));
export const useCambiarEstado = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (estado: EstadoAuditoria) => ep.cambiarEstado(idAuditoria, estado));
