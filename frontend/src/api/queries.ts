import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ep from './endpoints';
import type { ApiError } from './client';
// El cliente (api/client.ts) solo lanza ApiError, así que ese es el tipo de error de toda consulta y mutación.
declare module '@tanstack/react-query' {
  interface Register { defaultError: ApiError }
}

import type { AlcanceDefinido, Auditoria, CrearAuditoriaInput, CrearEvidenciaInput, CrearHallazgoInput, CrearRecomendacionInput, EstadoAuditoria, EvaluarControlInput } from './types';

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

/** Recarga todo lo que cuelga de una auditoría (y el listado). Devuelve una promesa que termina con los datos ya frescos. */
export function useRefrescarAuditoria(idAuditoria: number) {
  const qc = useQueryClient();
  return useCallback(async () => {
    await qc.invalidateQueries({ queryKey: clave.auditoria(idAuditoria) });
    void qc.invalidateQueries({ queryKey: clave.lista });
  }, [qc, idAuditoria]);
}

/**
 * Mutación sobre una auditoría. Por defecto espera a que el detalle esté recargado antes de darse por terminada.
 * Con `refrescar: false` no recarga nada: quien la usa decide cuándo (por ejemplo, después de una animación).
 */
function useMutacionDeAuditoria<TVars, TData>(idAuditoria: number, fn: (v: TVars) => Promise<TData>, refrescar = true) {
  const recargar = useRefrescarAuditoria(idAuditoria);
  return useMutation<TData, ApiError, TVars>({ mutationFn: fn, onSuccess: refrescar ? recargar : undefined });
}

export const useEvaluar = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (v: { idEvaluacion: number; body: EvaluarControlInput }) => ep.evaluarControl(v.idEvaluacion, v.body));
// Los tres registros no recargan solos: el formulario se pliega primero hacia la traza y recarga después.
export const useCrearEvidencia = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (v: { idEvaluacion: number; body: CrearEvidenciaInput }) => ep.crearEvidencia(v.idEvaluacion, v.body), false);
export const useCrearHallazgo = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (v: { idEvaluacion: number; body: CrearHallazgoInput }) => ep.crearHallazgo(v.idEvaluacion, v.body), false);
export const useCrearRecomendacion = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (v: { idHallazgo: number; body: CrearRecomendacionInput }) => ep.crearRecomendacion(v.idHallazgo, v.body), false);
export const useCambiarEstado = (idAuditoria: number) => useMutacionDeAuditoria(idAuditoria, (estado: EstadoAuditoria) => ep.cambiarEstado(idAuditoria, estado));

export const useControles = () => useQuery({ queryKey: ['controles'] as const, queryFn: ep.controles, staleTime: 5 * 60_000 });
export function useCrearAuditoria() {
  const qc = useQueryClient();
  return useMutation<Auditoria, ApiError, CrearAuditoriaInput>({ mutationFn: ep.crearAuditoria, onSuccess: () => { void qc.invalidateQueries({ queryKey: clave.lista }); } });
}
/** Trae a la caché todo lo que necesitan la cabecera y el alcance de una auditoría, antes de abrirla. */
export function usePrecargarAuditoria() {
  const qc = useQueryClient();
  return useCallback((id: number) => Promise.all([
    qc.prefetchQuery({ queryKey: clave.detalle(id), queryFn: () => ep.detalleAuditoria(id) }),
    qc.prefetchQuery({ queryKey: clave.integridad(id), queryFn: () => ep.verificarIntegridad(id) }),
    qc.prefetchQuery({ queryKey: ['controles'] as const, queryFn: ep.controles, staleTime: 5 * 60_000 }),
  ]).then(() => undefined), [qc]);
}
/** Definir el alcance no recarga: la pantalla fija primero los controles elegidos y recarga al terminar. */
export const useDefinirAlcance = (idAuditoria: number) => useMutation<AlcanceDefinido, ApiError, number[]>({ mutationFn: ids => ep.definirAlcance(idAuditoria, ids) });
