# AuditA API — Contrato para el Frontend

- **Base URL:** `http://localhost:3000/api`
- **Origen permitido por CORS:** `http://localhost:5173`. Si el Frontend corre en otro puerto, añádalo a `CORS_ORIGIN` en `backend/.env`.
- **Formato:** JSON en todas las peticiones y respuestas. Todo `POST` y `PATCH` con cuerpo debe llevar `Content-Type: application/json`, o la API responde 415.

## 1. Autenticación

```http
POST /api/auth/login
{ "email": "auditor@auditsys.co", "password": "..." }
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_at": "2026-11-12T22:45:00.000Z",
  "usuario": { "id": 2, "nombre": "Auditor Líder AuditSys", "email": "auditor@auditsys.co", "rol": "auditor" }
}
```

En el resto de peticiones, envíe la cabecera `Authorization: Bearer <token>`.

- El token dura 8 horas. Ante un **401** en cualquier ruta, borre el token y redirija al login.
- Para restaurar la sesión al recargar la página: `GET /api/auth/me`.
- No hay registro público. El admin crea usuarios con `POST /api/auth/usuarios` y los lista con `GET /api/auth/usuarios`.
- Tras 10 logins fallidos en 15 minutos (por IP y email), la API responde **429**. El encabezado `Retry-After` indica los segundos de espera.

**Usuarios de desarrollo:** `admin@auditsys.co` y `auditor@auditsys.co`. Las contraseñas están en `backend/.env` (`SEED_ADMIN_PASSWORD` y `SEED_AUDITOR_PASSWORD`).

**Roles:**

| | admin | auditor |
|---|---|---|
| Ver auditorías | todas | solo las propias |
| Crear auditorías y ejecutarlas | sí | sí |
| Crear controles del catálogo | sí | no (403) |
| Gestionar usuarios | sí | no (403) |

## 2. Formato de errores

Todos los errores tienen esta forma:

```json
{ "error": "Mensaje legible para mostrar", "code": "BAD_REQUEST", "details": "opcional" }
```

| HTTP | Cuándo | Qué hacer en la UI |
|---|---|---|
| 400 | Validación (Zod) o reglas CP-02/03/04/05 | Mostrar `error`. Si `details` es un arreglo `[{campo, mensaje}]`, marcar cada campo del formulario |
| 401 | Sin token, token inválido o expirado | Cerrar sesión e ir al login |
| 403 | Rol insuficiente o auditoría **CERRADA** (mensaje que empieza por `CP-13`) | Ocultar o deshabilitar la acción |
| 404 | No existe o no pertenece al usuario | Página "no encontrado" |
| 409 | Transición de estado no permitida, alcance fuera de `BORRADOR` o duplicado | Mostrar `error` |
| 422 | Cierre bloqueado por trazabilidad: incluye `anomalias` (sección 6) | Mostrar la lista de anomalías con enlaces al control |
| 429 | Demasiadas peticiones | Mostrar `error` |

Mensajes exactos de las reglas de negocio:

| Código | `error` |
|---|---|
| CP-03 | `CP-03: El alcance normativo exige seleccionar estrictamente entre 10 y 15 controles ISO/IEC 27002:2022.` |
| CP-04 | `CP-04: Las observaciones analíticas son obligatorias para controles parciales o no implementados.` |
| CP-05 | `CP-05: Debe justificar explícitamente la exclusión de un control marcado como No Aplicable.` |
| CP-13 | `CP-13: La auditoría está CERRADA. Sus registros son inmutables y no admiten modificaciones.` |
| Cierre | `Bloqueo de cierre por anomalías de trazabilidad (CP-06 / CP-08)` |

## 3. Tipos (TypeScript)

Se pueden copiar directamente al Frontend. Las fechas `DATE` llegan como `"YYYY-MM-DD"` y los timestamps como ISO-8601 UTC.

```ts
export type Rol = 'admin' | 'auditor';
export type EstadoAuditoria = 'BORRADOR' | 'EN_EJECUCION' | 'EN_REVISION' | 'CERRADA';
export type EstadoEvaluacion = 'IMPLEMENTADO' | 'PARCIALMENTE_IMPLEMENTADO' | 'NO_IMPLEMENTADO' | 'NO_APLICABLE';
export type FuenteEvidencia = 'DOCUMENTAL' | 'ENTREVISTA' | 'OBSERVACION_TECNICA';
export type Nivel = 'ALTA' | 'MEDIA' | 'BAJA';

export interface Usuario { id: number; nombre: string; email: string; rol: Rol; creado_en?: string }

export interface Auditoria {
  id: number;
  organizacion: string;
  alcance: string;
  fecha_inicio: string;        // YYYY-MM-DD
  fecha_fin: string;           // YYYY-MM-DD
  id_auditor: number;
  estado: EstadoAuditoria;
  creado_en: string;
  actualizado_en: string;
}

export interface AuditoriaListado extends Auditoria {
  auditor_nombre: string;
  total_controles: number;
  cumplimiento_pct: number;    // p. ej. 33.3
}

export interface ControlISO {
  id: number;
  codigo_iso: string;          // "8.5"
  clausula: 5 | 6 | 7 | 8;
  categoria_tema: string;      // Organizacionales | Personas | Físicos | Tecnológicos
  nombre: string;
  criterio_evaluacion: string; // pregunta guía para el auditor
  ejemplo_evidencia: string;
  attr_tipo_control: string;
  attr_propiedades_cia: string;
  attr_concepto_nist: string;
  attr_capacidad_operativa: string;
  attr_dominio_seguridad: string;
}

export interface Evidencia {
  id: number;
  id_evaluacion_control: number;
  descripcion: string;
  fuente: FuenteEvidencia;
  fecha_recoleccion: string;   // YYYY-MM-DD
  referencia_archivo: string | null;
  checksum_sha256: string | null;
  creado_en: string;
}

export interface Recomendacion {
  id: number;
  id_hallazgo: number;
  descripcion: string;
  prioridad: Nivel;
  plazo_estimado: string;
  creado_en: string;
}

export interface Hallazgo {
  id: number;
  id_evaluacion_control: number;
  condicion: string;
  criterio: string;
  causa: string;
  efecto_riesgo: string;
  severidad: Nivel;
  creado_en: string;
  recomendaciones: Recomendacion[];   // presente en el detalle de auditoría
}

export interface Evaluacion {
  id: number;
  id_auditoria: number;
  id_control: number;
  estado: EstadoEvaluacion;
  observaciones: string | null;
  justificacion_na: string | null;
  evaluado_en: string;
  control: ControlISO;          // presente en el detalle de auditoría
  evidencias: Evidencia[];      // presente en el detalle de auditoría
  hallazgos: Hallazgo[];        // presente en el detalle de auditoría
}

export interface ResumenMetricas {
  total_controles: number;
  implementados: number;
  parciales: number;
  no_implementados: number;
  no_aplicables: number;
  total_aplicables: number;
  cumplimiento_pct: number;
  hallazgos: { ALTA: number; MEDIA: number; BAJA: number; total: number };
}

export interface AuditoriaDetalle {
  auditoria: Auditoria & { auditor_nombre: string };
  evaluaciones: Evaluacion[];   // ordenadas por código ISO
  metricas: ResumenMetricas;
}

export type TipoAnomalia = 'CP-06_DISONANCIA_PROBATORIA' | 'CONTROL_SIN_HALLAZGO' | 'CP-08_HALLAZGO_HUERFANO';

export interface Anomalia {
  tipo: TipoAnomalia;
  id_evaluacion: number;
  id_hallazgo?: number;
  codigo_iso: string;
  control: string;
  estado: EstadoEvaluacion;
  mensaje: string;
}

export interface DiagnosticoTrazabilidad {
  id_auditoria: number;
  apta_para_cierre: boolean;
  total_anomalias: number;
  resumen: Record<TipoAnomalia, number>;
  anomalias: Anomalia[];
}

export interface Eslabon {
  id: number;
  id_auditoria: number;
  id_usuario: number;
  tipo_evento: string;
  payload_canonico: string;     // JSON en texto
  hash_anterior: string;
  hash_actual: string;
  timestamp_utc: string;
}
```

## 4. Endpoints

Todas las rutas, salvo `/health` y `/auth/login`, requieren token.

### Catálogo de controles

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/controles` | — | `ControlISO[]` (14, ordenados por código) |
| GET | `/controles/:id` | — | `ControlISO` |
| POST | `/controles` | `Omit<ControlISO,'id'>` | 201 `ControlISO` · **solo admin** |

### Auditorías

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/auditorias` | — | `AuditoriaListado[]` (las más recientes primero) |
| POST | `/auditorias` | `{ organizacion, alcance, fecha_inicio, fecha_fin }` | 201 `Auditoria` (estado `BORRADOR`) |
| GET | `/auditorias/:id` | — | `AuditoriaDetalle` ← **vista principal** |
| POST | `/auditorias/:id/alcance` | `{ ids_controles: number[] }` (10 a 15) | `{ auditoria, total_controles, evaluaciones }` |
| PATCH | `/auditorias/:id/estado` | `{ estado: EstadoAuditoria }` | `{ auditoria, informe }` (`informe` solo al cerrar) |
| GET | `/auditorias/:id/metricas` | — | `ResumenMetricas` |
| GET | `/auditorias/:id/trazabilidad` | — | `DiagnosticoTrazabilidad` |
| GET | `/auditorias/:id/informe` | — | `{ informe, verificacion }` · 404 si no está cerrada |
| GET | `/auditorias/:id/verificar-integridad` | — | `{ integra, algoritmo, hash_final, cadena, informe, eslabones: Eslabon[] }` |

### Ejecución (solo con la auditoría no cerrada; si está `CERRADA` → 403)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| PATCH | `/evaluaciones/:id` | `{ estado, observaciones?, justificacion_na? }` | `Evaluacion` (sin anidados) |
| POST | `/evaluaciones/:id/evidencias` | `{ descripcion, fuente, fecha_recoleccion?, referencia_archivo? }` | 201 `Evidencia` |
| POST | `/evaluaciones/:id/hallazgos` | `{ condicion, criterio?, causa, efecto_riesgo, severidad }` | 201 `Hallazgo` |
| POST | `/hallazgos/:id/recomendaciones` | `{ descripcion, prioridad, plazo_estimado }` | 201 `Recomendacion` |

Notas:

- `:id` en `/evaluaciones/:id` es el `id` de la evaluación (`AuditoriaDetalle.evaluaciones[i].id`), **no** el del control.
- En `PATCH /evaluaciones/:id`, `observaciones` es obligatorio (≥ 5 caracteres) para `PARCIALMENTE_IMPLEMENTADO` y `NO_IMPLEMENTADO`, y `justificacion_na` (≥ 5 caracteres) para `NO_APLICABLE`. Con cualquier otro estado, `justificacion_na` se guarda como `null`.
- `fecha_recoleccion` es opcional; por defecto toma la fecha de hoy. `referencia_archivo` es una ruta o URL en texto, porque la API todavía no recibe archivos.
- Si `criterio` del hallazgo se envía vacío, la API lo completa con el criterio del control ISO.
- `plazo_estimado` es texto libre de hasta 80 caracteres, p. ej. `"90 días"`.
- Hoy no existen endpoints para editar o borrar evidencias, hallazgos ni recomendaciones. Es intencional: la bitácora es append-only.
- Tras cada mutación, recargue `GET /auditorias/:id` para refrescar la vista y las métricas.

## 5. Ciclo de vida y estados

```
BORRADOR ──POST /alcance──▶ EN_EJECUCION ◀──▶ EN_REVISION
                                 │                 │
                                 └──── CERRADA ◀───┘   (definitivo, solo lectura)
```

| Estado actual | Acciones que debe ofrecer la UI |
|---|---|
| `BORRADOR` | Seleccionar entre 10 y 15 controles y confirmar el alcance |
| `EN_EJECUCION` / `EN_REVISION` | Evaluar controles, registrar evidencias, hallazgos y recomendaciones, cambiar a revisión o ejecución, cerrar |
| `CERRADA` | Solo lectura: informe y verificación de integridad. Ocultar los botones de edición |

`PATCH /estado` admite estas transiciones: `EN_EJECUCION → EN_REVISION | CERRADA` y `EN_REVISION → EN_EJECUCION | CERRADA`. Cualquier otra responde 409.

## 6. Cierre y anomalías

Antes de mostrar el botón "Cerrar auditoría", consulte `GET /auditorias/:id/trazabilidad`:

- Si `apta_para_cierre` es `true`, habilite el botón.
- Si no, liste `anomalias`. Cada una indica el control y qué falta:

| `tipo` | Qué falta | Cómo se resuelve |
|---|---|---|
| `CP-06_DISONANCIA_PROBATORIA` | Control `IMPLEMENTADO` sin evidencias | Registrar una evidencia |
| `CONTROL_SIN_HALLAZGO` | Control parcial o no implementado sin hallazgo | Registrar un hallazgo |
| `CP-08_HALLAZGO_HUERFANO` | Hallazgo sin recomendaciones | Registrar una recomendación (usar `id_hallazgo`) |

Si aun así se intenta cerrar, la API responde **422**:

```json
{
  "error": "Bloqueo de cierre por anomalías de trazabilidad (CP-06 / CP-08)",
  "code": "UNPROCESSABLE_ENTITY",
  "total_anomalias": 1,
  "resumen": { "CP-06_DISONANCIA_PROBATORIA": 0, "CONTROL_SIN_HALLAZGO": 0, "CP-08_HALLAZGO_HUERFANO": 1 },
  "anomalias": [ { "tipo": "CP-08_HALLAZGO_HUERFANO", "id_hallazgo": 8, "codigo_iso": "8.13", "mensaje": "..." } ]
}
```

Un cierre correcto responde **200** con `{ auditoria: { estado: 'CERRADA', ... }, informe: { cumplimiento_pct, total_implementados, total_aplicables, total_no_aplicables, hash_integridad, fecha_generacion, ... } }`.

## 7. Métrica de cumplimiento (RF07)

```
cumplimiento_pct = ROUND(100 × IMPLEMENTADO / (total − NO_APLICABLE), 1)
```

Los controles parciales cuentan 0 y los `NO_APLICABLE` no entran en el denominador. Ejemplo (CP-09): 4 implementados, 5 parciales, 3 no implementados y 1 no aplicable dan 4 / 12 = **33.3 %**. La UI debe mostrar el valor que envía la API, sin recalcularlo.

## 8. Integridad (vista de informe)

`GET /auditorias/:id/verificar-integridad` devuelve:

- `integra` (boolean): indicador principal; mostrar un sello verde o rojo.
- `hash_final`: hash del último eslabón, para mostrarlo como huella del informe.
- `cadena.ruptura`: si no es `null`, indica en qué eslabón y por qué se rompió la cadena.
- `informe.checks`: detalle de las verificaciones del informe.
- `eslabones`: línea de tiempo de eventos (`tipo_evento`, `timestamp_utc`, `hash_actual`, `id_usuario`). `payload_canonico` es JSON en texto y se puede mostrar con `JSON.parse`.

## 9. Flujo de pantallas sugerido

1. **Login**: guardar token y usuario.
2. **Listado de auditorías** (`GET /auditorias`): tabla con organización, fechas, estado, auditor y % de cumplimiento, más el botón "Nueva auditoría".
3. **Nueva auditoría**: formulario de 4 campos (`POST /auditorias`).
4. **Alcance** (en `BORRADOR`): lista de `GET /controles` con casillas y un contador que exija entre 10 y 15 (`POST /alcance`).
5. **Ejecución** (`GET /auditorias/:id`), por cada control:
   - estado, observaciones y justificación;
   - evidencias;
   - hallazgos con sus recomendaciones;
   - y un panel lateral con las métricas.
6. **Pre-cierre**: panel de trazabilidad, luego "Cerrar auditoría".
7. **Informe** (en `CERRADA`): métricas finales, sello de integridad y línea de tiempo de la bitácora.

## 10. Verificar la API

```bash
cd backend
npm run db:up && npm run dev     # terminal 1
npm run test:qa                  # terminal 2 → 74 verificaciones, CP-01 a CP-13
```

La suite deja creada una auditoría completa y cerrada ("Empresa ABC S.A.S."), que sirve como dato de ejemplo para desarrollar las vistas.
