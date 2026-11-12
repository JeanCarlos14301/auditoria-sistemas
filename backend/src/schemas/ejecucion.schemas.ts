import { z } from 'zod';
import { ESTADOS_EVALUACION, FUENTES_EVIDENCIA, NIVELES } from '../types/domain.js';
import { fechaISO, textoOpcional, textoRequerido } from './common.js';

/**
 * RF03: forma del cuerpo. Las reglas CP-04 / CP-05 se aplican en el controlador
 * para devolver exactamente los mensajes normativos.
 */
export const evaluarControlSchema = z.object({
  estado: z.enum(ESTADOS_EVALUACION, { error: `estado debe ser uno de: ${ESTADOS_EVALUACION.join(', ')}` }),
  observaciones: textoOpcional(5000),
  justificacion_na: textoOpcional(5000),
});
export type EvaluarControlInput = z.infer<typeof evaluarControlSchema>;

/** RF04 */
export const crearEvidenciaSchema = z.object({
  descripcion: textoRequerido('descripcion', 5000),
  fuente: z.enum(FUENTES_EVIDENCIA, { error: `fuente debe ser una de: ${FUENTES_EVIDENCIA.join(', ')}` }),
  fecha_recoleccion: fechaISO('fecha_recoleccion').optional(),
  referencia_archivo: textoOpcional(500),
});
export type CrearEvidenciaInput = z.infer<typeof crearEvidenciaSchema>;

/** RF05 — Estructura de hallazgo ISO 19011:2018 (condición, criterio, causa, efecto). */
export const crearHallazgoSchema = z.object({
  condicion: textoRequerido('condicion'),
  // Opcional: si llega vacío se completa con el criterio del control ISO asociado.
  criterio: textoOpcional(5000),
  causa: textoRequerido('causa'),
  efecto_riesgo: textoRequerido('efecto_riesgo'),
  severidad: z.enum(NIVELES, { error: `severidad debe ser una de: ${NIVELES.join(', ')}` }),
});
export type CrearHallazgoInput = z.infer<typeof crearHallazgoSchema>;

/** RF06 */
export const crearRecomendacionSchema = z.object({
  descripcion: textoRequerido('descripcion'),
  prioridad: z.enum(NIVELES, { error: `prioridad debe ser una de: ${NIVELES.join(', ')}` }),
  plazo_estimado: textoRequerido('plazo_estimado', 80),
});
export type CrearRecomendacionInput = z.infer<typeof crearRecomendacionSchema>;
