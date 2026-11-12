import { Router } from 'express';
import { authenticate, requireUser } from '../../middlewares/authenticate.js';
import { requireRole } from '../../middlewares/authorize.js';
import { loginRateLimiter } from '../../middlewares/rateLimit.js';
import { validate, validated } from '../../middlewares/validate.js';
import { crearUsuarioSchema, loginSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

export const authRouter = Router();

/** POST /api/auth/login — público, con rate limit estricto. */
authRouter.post('/login', loginRateLimiter, validate({ body: loginSchema }), async (req, res) => {
  const result = await authService.login(validated(req, 'body', loginSchema));
  res.json(result);
});

/** GET /api/auth/me — perfil del usuario autenticado. */
authRouter.get('/me', authenticate, async (req, res) => {
  res.json(await authService.obtenerUsuario(requireUser(req).id));
});

/**
 * Gestión de usuarios: solo admin. No hay auto-registro público (principio de
 * mínimo privilegio): las cuentas de auditor las crea un administrador.
 */
authRouter.get('/usuarios', authenticate, requireRole('admin'), async (_req, res) => {
  res.json(await authService.listarUsuarios());
});

authRouter.post(
  '/usuarios',
  authenticate,
  requireRole('admin'),
  validate({ body: crearUsuarioSchema }),
  async (req, res) => {
    const usuario = await authService.crearUsuario(validated(req, 'body', crearUsuarioSchema));
    res.status(201).location(`/api/auth/usuarios/${usuario.id}`).json(usuario);
  },
);
