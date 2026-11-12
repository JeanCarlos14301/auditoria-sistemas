import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/authorize.js';
import { idParam, validate, validated } from '../middlewares/validate.js';
import { crearControlSchema } from '../schemas/control.schemas.js';
import * as controlService from '../services/control.service.js';

export const controlesRouter = Router();

const paramsSchema = z.object({ id: idParam });

controlesRouter.use(requireAuth);

/** GET /api/controles — catálogo ISO/IEC 27002:2022 (para seleccionar el alcance). */
controlesRouter.get('/', async (_req, res) => {
  res.json(await controlService.listarControles());
});

controlesRouter.get('/:id', validate({ params: paramsSchema }), async (req, res) => {
  res.json(await controlService.obtenerControl(validated(req, 'params', paramsSchema).id));
});

/** POST /api/controles — gestión del catálogo: solo admin (CP-13: auditor -> 403). */
controlesRouter.post('/', requireRole('admin'), validate({ body: crearControlSchema }), async (req, res) => {
  const control = await controlService.crearControl(validated(req, 'body', crearControlSchema));
  res.status(201).location(`/api/controles/${control.id}`).json(control);
});
