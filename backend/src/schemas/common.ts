import { z } from 'zod';

/** Texto obligatorio: se recortan espacios y se exige contenido real. */
export const textoRequerido = (campo: string, max = 5000) =>
  z
    .string({ error: `${campo} es obligatorio` })
    .trim()
    .min(1, `${campo} es obligatorio y no puede estar vacío`)
    .max(max, `${campo} no puede superar ${max} caracteres`);

/** Texto opcional: '' o solo espacios se normalizan a null. */
export const textoOpcional = (max = 5000) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

/** Fecha de calendario YYYY-MM-DD válida. */
export const fechaISO = (campo: string) =>
  z.iso.date({ error: `${campo} debe ser una fecha válida con formato YYYY-MM-DD` });

export const idEntero = z.number().int().positive().max(2_147_483_647);
