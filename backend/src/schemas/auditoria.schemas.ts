import { z } from 'zod';
import { ESTADOS_AUDITORIA } from '../types/domain.js';
import { fechaISO, idEntero, textoRequerido } from './common.js';

/** RF01 / CP-02: todos los campos obligatorios y no vacíos; fecha_fin >= fecha_inicio. */
export const crearAuditoriaSchema = z
  .object({
    organizacion: textoRequerido('organizacion', 180),
    alcance: textoRequerido('alcance', 5000),
    fecha_inicio: fechaISO('fecha_inicio'),
    fecha_fin: fechaISO('fecha_fin'),
  })
  .refine((d) => new Date(d.fecha_fin) >= new Date(d.fecha_inicio), {
    path: ['fecha_fin'],
    message: 'fecha_fin debe ser igual o posterior a fecha_inicio',
  });
export type CrearAuditoriaInput = z.infer<typeof crearAuditoriaSchema>;

/**
 * RF02: solo valida forma (array de enteros). El rango 10–15 tras eliminar duplicados
 * (CP-03) se comprueba en el controlador para devolver el mensaje normativo exacto.
 */
export const alcanceSchema = z.object({
  ids_controles: z.array(idEntero, { error: 'ids_controles debe ser un arreglo de IDs de control' }).max(100),
});
export type AlcanceInput = z.infer<typeof alcanceSchema>;

export const cambioEstadoSchema = z.object({
  estado: z.enum(ESTADOS_AUDITORIA, { error: `estado debe ser uno de: ${ESTADOS_AUDITORIA.join(', ')}` }),
});
export type CambioEstadoInput = z.infer<typeof cambioEstadoSchema>;
