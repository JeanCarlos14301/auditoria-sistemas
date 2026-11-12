# AuditA — Backend

API REST para gestionar auditorías de seguridad de la información según **ISO/IEC 27002:2022** (controles) e **ISO 19011:2018** (metodología de hallazgos). Cada cambio queda registrado en una bitácora forense encadenada criptográficamente (Hash Chain HMAC-SHA256).

**Stack:** Node.js 20+ · TypeScript · Express 5 · PostgreSQL 16 (Docker) · Zod · JWT · bcrypt · Helmet

> Contrato completo de la API para el Frontend: **[API.md](API.md)**

## Puesta en marcha

Requisitos: Node.js 20+ y Docker Desktop.

```bash
cd backend
npm install
cp .env.example .env     # solo la primera vez; ajustar secretos y contraseñas
npm run db:up            # PostgreSQL en Docker (crea el esquema y los 14 controles)
npm run dev              # API en http://localhost:3000/api
```

En otra terminal, la suite QA (CP-01 a CP-13) contra la API en ejecución:

```bash
npm run test:qa
```

### Usuarios de desarrollo

Con `SEED_DEFAULT_USERS=true`, al arrancar se crean (si no existen) estos usuarios, con las contraseñas definidas en `.env`:

| Rol | Email | Variable de la contraseña |
|---|---|---|
| admin | `admin@auditsys.co` | `SEED_ADMIN_PASSWORD` |
| auditor | `auditor@auditsys.co` | `SEED_AUDITOR_PASSWORD` |

El seeder no se ejecuta con `NODE_ENV=production`. Para crear más administradores: `npm run admin:create -- --nombre "..." --email ... --password "..."`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | API con recarga automática (`src/index.ts`) |
| `npm run build` / `npm start` | Compila a `dist/` y lo ejecuta |
| `npm run typecheck` | Verificación de tipos |
| `npm run test:qa` | Suite QA CP-01…CP-13 contra `QA_API_URL` (API levantada) |
| `npm run db:up` / `db:down` | Levanta / detiene PostgreSQL |
| `npm run db:reset` | **Borra todos los datos** y vuelve a ejecutar `sql/init_auditsys.sql` |
| `npm run admin:create` | Crea un administrador |
| `npm run chain:verify -- <id>` | Verificación forense de la cadena de una auditoría (exit 2 si hay ruptura) |

`sql/init_auditsys.sql` solo se ejecuta cuando el volumen de Docker está vacío. Si cambia el SQL, use `npm run db:reset`.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `PORT` | Puerto HTTP (3000) |
| `DATABASE_URL` | Conexión PostgreSQL; debe coincidir con `docker-compose.yml` |
| `JWT_SECRET` | Firma de tokens (≥ 32 caracteres) |
| `JWT_EXPIRES_IN` | Vigencia del token (`8h`) |
| `ORG_HMAC_SECRET` | Clave de la Hash Chain (≥ 32 caracteres, distinta de `JWT_SECRET`). **No cambiar con datos existentes** |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma (`http://localhost:5173`) |
| `BCRYPT_ROUNDS` | Coste de bcrypt (10–14) |
| `SEED_DEFAULT_USERS`, `SEED_*_EMAIL`, `SEED_*_PASSWORD` | Usuarios de desarrollo. Las contraseñas van **entre comillas** (dotenv corta el valor en `#`) |
| `QA_API_URL` | URL base usada por `npm run test:qa` |

La API valida estas variables al arrancar y no inicia si falta alguna o es insegura.

## Arquitectura

```
src/
  index.ts                 Punto de entrada: conexión BD, seeder, servidor HTTP, apagado ordenado
  app.ts                   Express: Helmet, CORS, JSON, rate limit, rutas /api, errorHandler
  config/env.ts            Validación de entorno (Zod)
  db/pool.ts               Pool pg, consultas parametrizadas, withTransaction
  db/seed.ts               seedDefaultUsers()
  crypto/
    canonical.ts           JSON canónico determinista
    hashing.ts             SHA-256, HMAC de la organización, hash del informe
    hashChain.ts           appendHashChainEvent / verifyAuditHashChain
  auth/                    bcrypt + política de contraseñas, JWT HS256
  middlewares/
    authenticate.ts        requireAuth (Bearer JWT; rol leído de la BD en cada petición)
    authorize.ts           requireRole('admin')
    immutableAudit.ts      Acceso al recurso (404 si es ajeno) + 403 si la auditoría está CERRADA
    auditoriaGuards.ts     loadAuditoria (lecturas)
    validate.ts            Validación Zod de body/params/query
    rateLimit.ts           Límite global y de login
    security.ts            Helmet, CORS, no-store, Content-Type JSON
    errorHandler.ts        Formato único de error; traduce errores de PostgreSQL
  schemas/                 Esquemas Zod de entrada
  services/
    auditoria.service.ts   Alta, alcance, detalle, máquina de estados y cierre con informe
    ejecucion.service.ts   Evaluaciones (CP-04/05), evidencias, hallazgos, recomendaciones
    metricas.service.ts    Motor RF07 y validador de trazabilidad RNF05
    informe.service.ts     Informe y verificación forense
    control.service.ts     Catálogo ISO/IEC 27002:2022
  routes/                  auditorias, ejecucion, controles
  modules/auth/            Login y gestión de usuarios
  scripts/                 run-qa-tests, createAdmin, verifyChain
sql/init_auditsys.sql      DDL (9 tablas), triggers de inmutabilidad y seeder de 14 controles
```

## Reglas de negocio

| Regla | Dónde se aplica |
|---|---|
| **RF01 / CP-01 / CP-02**: la auditoría nace en `BORRADOR`; campos obligatorios; `fecha_fin ≥ fecha_inicio` | Zod + CHECK en BD |
| **RF02 / CP-03**: alcance de 10 a 15 controles distintos (sin contar duplicados); solo en `BORRADOR`; pasa a `EN_EJECUCION` | `normalizarAlcance` + `definirAlcance` |
| **RF03 / CP-04**: `PARCIALMENTE_IMPLEMENTADO` y `NO_IMPLEMENTADO` exigen observaciones (≥ 5 caracteres) | `validarReglasEvaluacion` |
| **RF03 / CP-05**: `NO_APLICABLE` exige `justificacion_na` (≥ 5 caracteres) | `validarReglasEvaluacion` + CHECK en BD |
| **RF04**: `checksum_sha256 = SHA-256(descripcion|fuente|referencia_archivo)` | `registrarEvidencia` |
| **RF05**: hallazgo con condición, criterio, causa, efecto y severidad; si no se envía criterio, se toma el del control | `registrarHallazgo` |
| **RF07 / CP-09**: `cumplimiento = ROUND(100 × IMPLEMENTADO / (total − NO_APLICABLE), 1)`; los parciales cuentan 0 | `calcularMetricasAuditoria` |
| **RNF05 / CP-06 / CP-08**: el cierre se bloquea (422) si hay controles `IMPLEMENTADO` sin evidencia, parciales o no implementados sin hallazgo, o hallazgos sin recomendación | `validarTrazabilidadPreCierre` |
| **RF08**: al cerrar se genera el informe con su snapshot y se sella la auditoría | `cerrarAuditoria` |
| **CP-13**: catálogo de controles solo para admin; auditoría `CERRADA` inmutable (403) | `requireRole`, `immutableAudit` |

Máquina de estados: `BORRADOR → (POST /alcance) → EN_EJECUCION ⇄ EN_REVISION → CERRADA`. `CERRADA` es definitivo.

## Seguridad

- **Acceso:** el admin ve todas las auditorías; el auditor solo las suyas. Un recurso ajeno responde 404, para no revelar que existe.
- **Concurrencia:** cada mutación vuelve a leer y bloquear la fila de la auditoría dentro de su transacción. Así no puede colarse una modificación entre la validación de cierre y el sellado.
- **Autenticación:** JWT HS256 con algoritmo, emisor y audiencia fijados. Contraseñas bcrypt de 12 a 72 bytes con complejidad. El login responde igual y tarda lo mismo exista o no el usuario, y tiene límite de intentos fallidos.
- **Superficie HTTP:** Helmet con CSP `default-src 'none'`, CORS con lista blanca, `Cache-Control: no-store`, cuerpo JSON de máximo 100 kB y consultas siempre parametrizadas.

## Hash Chain forense

Cada auditoría tiene su propia cadena en `bitacora_hash_chain`:

```
hash_actual = HMAC-SHA256(ORG_HMAC_SECRET, canonical({v, id_auditoria, id_usuario,
              tipo_evento, timestamp_utc, hash_anterior, payload_canonico}))
```

- **Eventos:** `CREACION_AUDITORIA`, `ALCANCE_DEFINIDO`, `EVALUACION_CONTROL`, `REGISTRO_EVIDENCIA`, `REGISTRO_HALLAZGO`, `REGISTRO_RECOMENDACION`, `CAMBIO_ESTADO`, `CIERRE_INFORME`.
- **Atomicidad:** el evento se escribe en la misma transacción que el cambio de negocio, y un bloqueo por auditoría impide que la cadena se bifurque.
- **Inmutabilidad:** triggers de BD bloquean `UPDATE`, `DELETE` y `TRUNCATE` sobre la bitácora.
- **Cierre:** el evento `CIERRE_INFORME` sella el hash del snapshot del informe, y `informe.hash_integridad` es el hash de ese eslabón. `GET /verificar-integridad` comprueba la cadena completa, que el cierre sea el último eslabón, que el snapshot no se haya alterado y que las métricas del informe coincidan con las selladas.
