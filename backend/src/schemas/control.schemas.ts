import { z } from 'zod';
import { textoRequerido } from './common.js';

/** Alta de un control del catálogo ISO/IEC 27002:2022 (solo admin). */
export const crearControlSchema = z.object({
  codigo_iso: z
    .string()
    .trim()
    .regex(/^[5-8]\.\d{1,2}$/, 'codigo_iso debe tener el formato <cláusula>.<n>, p. ej. 8.16'),
  clausula: z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)], {
    error: 'clausula debe ser 5, 6, 7 u 8',
  }),
  categoria_tema: textoRequerido('categoria_tema', 60),
  nombre: textoRequerido('nombre', 180),
  criterio_evaluacion: textoRequerido('criterio_evaluacion'),
  ejemplo_evidencia: textoRequerido('ejemplo_evidencia'),
  attr_tipo_control: textoRequerido('attr_tipo_control', 100),
  attr_propiedades_cia: textoRequerido('attr_propiedades_cia', 120),
  attr_concepto_nist: textoRequerido('attr_concepto_nist', 150),
  attr_capacidad_operativa: textoRequerido('attr_capacidad_operativa', 120),
  attr_dominio_seguridad: textoRequerido('attr_dominio_seguridad', 120),
}).refine((c) => c.codigo_iso.startsWith(`${c.clausula}.`), {
  path: ['codigo_iso'],
  message: 'codigo_iso debe pertenecer a la cláusula indicada',
});
export type CrearControlInput = z.infer<typeof crearControlSchema>;
