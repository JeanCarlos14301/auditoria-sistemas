import { Router } from 'express';
import { requireLoadedAuditoria, loadAuditoria } from '../middlewares/auditoriaGuards.js';
import { requireAuth, requireUser } from '../middlewares/authenticate.js';
import { immutableAudit } from '../middlewares/immutableAudit.js';
import { validate, validated } from '../middlewares/validate.js';
import { alcanceSchema, cambioEstadoSchema, crearAuditoriaSchema } from '../schemas/auditoria.schemas.js';
import * as auditoriaService from '../services/auditoria.service.js';
import * as informeService from '../services/informe.service.js';
import { calcularMetricasAuditoria, validarTrazabilidadPreCierre } from '../services/metricas.service.js';

export const auditoriasRouter = Router();

// Todas las rutas requieren autenticación.
auditoriasRouter.use(requireAuth);

/** GET /api/auditorias — listado con cumplimiento_pct dinámico. */
auditoriasRouter.get('/', async (req, res) => {
  res.json(await auditoriaService.listarAuditorias(requireUser(req)));
});

/** POST /api/auditorias — RF01 / CP-01 / CP-02. */
auditoriasRouter.post('/', validate({ body: crearAuditoriaSchema }), async (req, res) => {
  const auditoria = await auditoriaService.crearAuditoria(
    validated(req, 'body', crearAuditoriaSchema),
    requireUser(req),
  );
  res.status(201).location(`/api/auditorias/${auditoria.id}`).json(auditoria);
});

/** GET /api/auditorias/:id — detalle completo para el Frontend. */
auditoriasRouter.get('/:id', loadAuditoria('id'), async (req, res) => {
  res.json(await auditoriaService.obtenerDetalleAuditoria(requireLoadedAuditoria(req).id));
});

/** POST /api/auditorias/:id/alcance — RF02 / CP-03. */
auditoriasRouter.post(
  '/:id/alcance',
  immutableAudit('auditoria'),
  validate({ body: alcanceSchema }),
  async (req, res) => {
    const { ids_controles } = validated(req, 'body', alcanceSchema);
    const ids = auditoriaService.normalizarAlcance(ids_controles); // 400 CP-03 si < 10 o > 15
    res.json(await auditoriaService.definirAlcance(requireLoadedAuditoria(req).id, ids, requireUser(req)));
  },
);

/** GET /api/auditorias/:id/metricas — RF07 / CP-09. */
auditoriasRouter.get('/:id/metricas', loadAuditoria('id'), async (req, res) => {
  res.json(await calcularMetricasAuditoria(requireLoadedAuditoria(req).id));
});

/** GET /api/auditorias/:id/trazabilidad — RNF05 / CP-06 / CP-08 (diagnóstico pre-cierre). */
auditoriasRouter.get('/:id/trazabilidad', loadAuditoria('id'), async (req, res) => {
  res.json(await validarTrazabilidadPreCierre(requireLoadedAuditoria(req).id));
});

/** PATCH /api/auditorias/:id/estado — RF08: transición de estado y cierre con informe. */
auditoriasRouter.patch(
  '/:id/estado',
  immutableAudit('auditoria'),
  validate({ body: cambioEstadoSchema }),
  async (req, res) => {
    const { estado } = validated(req, 'body', cambioEstadoSchema);
    res.json(await auditoriaService.cambiarEstado(requireLoadedAuditoria(req).id, estado, requireUser(req)));
  },
);

/** GET /api/auditorias/:id/informe — informe + verificación criptográfica en vivo. */
auditoriasRouter.get('/:id/informe', loadAuditoria('id'), async (req, res) => {
  res.json(await informeService.obtenerInformeVerificado(requireLoadedAuditoria(req).id));
});

/** GET /api/auditorias/:id/verificar-integridad — estado de la Hash Chain + eslabones. */
auditoriasRouter.get('/:id/verificar-integridad', loadAuditoria('id'), async (req, res) => {
  res.json(await informeService.verificarIntegridadAuditoria(requireLoadedAuditoria(req).id));
});
