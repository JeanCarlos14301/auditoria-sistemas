import type { AuditoriaRow, AuthUser, ValidatedRequestData } from './domain.js';

declare global {
  namespace Express {
    interface Request {
      /** Establecido por `authenticate` / `requireAuth`. */
      user?: AuthUser;
      /** Establecido por `loadAuditoria` o `immutableAudit` tras comprobar propiedad/rol. */
      auditoria?: AuditoriaRow;
      /** ID numérico (validado) del recurso de la ruta, establecido por `immutableAudit`. */
      resourceId?: number;
      /** Datos ya validados y saneados por `validate()`. */
      validated?: ValidatedRequestData;
    }
  }
}

export {};
