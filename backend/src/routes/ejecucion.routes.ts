import { Router } from 'express';
import { requireLoadedAuditoria } from '../middlewares/auditoriaGuards.js';
import { requireAuth, requireUser } from '../middlewares/authenticate.js';
import { immutableAudit, requireResourceId } from '../middlewares/immutableAudit.js';
import { validate, validated } from '../middlewares/validate.js';
import {
  crearEvidenciaSchema,
  crearHallazgoSchema,
  crearRecomendacionSchema,
  evaluarControlSchema,
} from '../schemas/ejecucion.schemas.js';
import * as ejecucion from '../services/ejecucion.service.js';

/**
 * Rutas de ejecución de la auditoría. Todas las mutaciones pasan por `immutableAudit`:
 * 404 si el recurso no existe o no pertenece al usuario; 403 si la auditoría está CERRADA (CP-13).
 */
export const ejecucionRouter = Router();

/** PATCH /api/evaluaciones/:id — RF03 / CP-04 / CP-05. */
ejecucionRouter.patch(
  '/evaluaciones/:id',
  requireAuth,
  immutableAudit('evaluacion'),
  validate({ body: evaluarControlSchema }),
  async (req, res) => {
    res.json(
      await ejecucion.evaluarControl(
        requireLoadedAuditoria(req).id,
        requireResourceId(req),
        validated(req, 'body', evaluarControlSchema),
        requireUser(req),
      ),
    );
  },
);

/** POST /api/evaluaciones/:id/evidencias — RF04. */
ejecucionRouter.post(
  '/evaluaciones/:id/evidencias',
  requireAuth,
  immutableAudit('evaluacion'),
  validate({ body: crearEvidenciaSchema }),
  async (req, res) => {
    const evidencia = await ejecucion.registrarEvidencia(
      requireLoadedAuditoria(req).id,
      requireResourceId(req),
      validated(req, 'body', crearEvidenciaSchema),
      requireUser(req),
    );
    res.status(201).json(evidencia);
  },
);

/** POST /api/evaluaciones/:id/hallazgos — RF05 (ISO 19011:2018). */
ejecucionRouter.post(
  '/evaluaciones/:id/hallazgos',
  requireAuth,
  immutableAudit('evaluacion'),
  validate({ body: crearHallazgoSchema }),
  async (req, res) => {
    const hallazgo = await ejecucion.registrarHallazgo(
      requireLoadedAuditoria(req).id,
      requireResourceId(req),
      validated(req, 'body', crearHallazgoSchema),
      requireUser(req),
    );
    res.status(201).json(hallazgo);
  },
);

/** POST /api/hallazgos/:id/recomendaciones — RF06. */
ejecucionRouter.post(
  '/hallazgos/:id/recomendaciones',
  requireAuth,
  immutableAudit('hallazgo'),
  validate({ body: crearRecomendacionSchema }),
  async (req, res) => {
    const recomendacion = await ejecucion.registrarRecomendacion(
      requireLoadedAuditoria(req).id,
      requireResourceId(req),
      validated(req, 'body', crearRecomendacionSchema),
      requireUser(req),
    );
    res.status(201).json(recomendacion);
  },
);
