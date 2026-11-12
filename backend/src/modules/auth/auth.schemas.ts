import { z } from 'zod';
import { ROLES } from '../../auth/jwt.js';
import { passwordSchema } from '../../auth/password.js';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(150)
  .pipe(z.email('Email inválido'));

export const loginSchema = z.object({
  email: emailSchema,
  // En login no se aplica la política completa (no revelar reglas); solo límites de tamaño.
  password: z.string().min(1, 'Contraseña requerida').max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  rol: z.enum(ROLES).default('auditor'),
});
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
