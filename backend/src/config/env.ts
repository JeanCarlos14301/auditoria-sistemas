import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const secret = (name: string) =>
  z
    .string({ error: `${name} es obligatorio` })
    .min(32, `${name} debe tener al menos 32 caracteres`);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL debe ser una URL postgresql://'),
  JWT_SECRET: secret('JWT_SECRET'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'JWT_EXPIRES_IN debe tener el formato <n>[s|m|h|d], p. ej. 8h')
    .default('8h'),
  ORG_HMAC_SECRET: secret('ORG_HMAC_SECRET'),
  CORS_ORIGIN: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),

  // Usuarios por defecto (solo desarrollo/QA). Sin contraseña definida, no se siembra ese usuario.
  SEED_DEFAULT_USERS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SEED_ADMIN_EMAIL: z.string().default('admin@auditsys.co'),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_AUDITOR_EMAIL: z.string().default('auditor@auditsys.co'),
  SEED_AUDITOR_PASSWORD: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail-fast: nunca arrancar con configuración insegura o incompleta.
  console.error('[config] Variables de entorno inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

if (parsed.data.JWT_SECRET === parsed.data.ORG_HMAC_SECRET) {
  console.error('[config] JWT_SECRET y ORG_HMAC_SECRET deben ser distintos (separación de claves).');
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export const isProduction = env.NODE_ENV === 'production';
