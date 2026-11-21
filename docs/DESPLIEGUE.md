# Despliegue de AuditA

[← Volver al README](../README.md)

Todo el sistema se despliega en **Vercel**, desde el mismo repositorio de GitHub:

| Pieza | En Vercel | Carpeta |
|---|---|---|
| Base de datos | PostgreSQL de **Neon**, creada desde la pestaña *Storage* de Vercel (persistente) | — |
| API | Proyecto `audita-api`: la app Express corre como **Vercel Function** | `backend/` |
| Interfaz | Proyecto `audita-web`: sitio estático de **Vite** | `frontend/` |

Cada `git push` a `main` vuelve a desplegar los dos proyectos.

```
Navegador ──► audita-web.vercel.app        (React, estático)
                 │  VITE_API_URL
                 ▼
             audita-api.vercel.app/api     (Express en una Vercel Function)
                 │  DATABASE_URL
                 ▼
             PostgreSQL 16 (Neon)          (datos persistentes)
```

---

## Paso 1 · Crear el proyecto de la API

1. En [vercel.com](https://vercel.com), haga clic en **Add New → Project** e importe el repositorio `auditoria-sistemas`.
2. Configure el proyecto:
   - **Project Name:** `audita-api`
   - **Root Directory:** `backend`
   - **Framework Preset:** *Other*. No toque el build: lo define `backend/vercel.json`.
3. Todavía **no** haga clic en *Deploy*. Primero cree la base de datos (paso 2).

## Paso 2 · Crear la base de datos

1. En el proyecto `audita-api`, abra **Storage → Create Database → Neon (Postgres)**.
   - **Región:** la más cercana a sus usuarios (por ejemplo, `Washington, D.C., USA – iad1`). Use la misma región para la base y las funciones.
   - Al conectarla al proyecto, Vercel agrega sola la variable `DATABASE_URL`.
2. Copie la cadena de conexión **directa**: la que **no** contiene `-pooler` en el host. Está en *Storage → la base → .env.local* (`DATABASE_URL_UNPOOLED`). Si la variable `DATABASE_URL` del proyecto apunta al host con `-pooler`, reemplace su valor por la cadena directa.
3. Desde su PC, cree las tablas y el catálogo de controles. Es un solo paso:

   ```powershell
   cd backend
   npm install
   $env:DATABASE_URL="<CADENA_DIRECTA_DE_NEON>"
   npm run db:init
   ```

   Debe responder `Esquema creado. Controles ISO 27002 cargados: 14`. Si el esquema ya existe, no hace nada. En bash: `DATABASE_URL="..." npm run db:init`.

   > El editor **Query** de Vercel no sirve para esto: ejecuta una sola sentencia por vez («cannot insert multiple commands into a prepared statement»). Como alternativa a `db:init`, use el **SQL Editor** de la consola de Neon (*Open in Neon*) o `psql "<cadena>" -f backend/sql/init_auditsys.sql`.

## Paso 3 · Variables de entorno de la API

En **audita-api → Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Cadena directa de Neon (paso 2) |
| `JWT_SECRET` | Valor aleatorio de al menos 32 caracteres |
| `ORG_HMAC_SECRET` | **Otro** valor aleatorio de al menos 32 caracteres. **No cambiarlo nunca** después de crear auditorías |
| `JWT_EXPIRES_IN` | `8h`, exactamente: sin comillas ni espacios |
| `CORS_ORIGIN` | URL del frontend, sin barra final, p. ej. `https://audita-web.vercel.app`. Se completa en el paso 5 |
| `TRUST_PROXY` | `1` |
| `PG_POOL_MAX` | `3` |

Para generar los secretos:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Guarde los dos secretos en un lugar seguro; los va a necesitar en el paso 6.

Después haga clic en **Deploy**. Cuando termine, abra `https://audita-api.vercel.app/api/health`. Debe responder:

```json
{ "status": "ok", "db": "ok" }
```

## Paso 4 · Crear el proyecto del frontend

1. **Add New → Project** e importe el **mismo** repositorio.
2. Configure el proyecto:
   - **Project Name:** `audita-web`
   - **Root Directory:** `frontend`
   - **Framework Preset:** *Vite* (se detecta solo)
3. En **Environment Variables**, agregue `VITE_API_URL` = `https://audita-api.vercel.app/api`, sin barra final, con tipo *Config* (es pública: viaja en el JavaScript del navegador). **Antes** del primer deploy: Vite la incrusta al compilar.
4. Haga clic en **Deploy**.

`frontend/vercel.json` redirige todas las rutas a `index.html`: así, recargar `/auditorias/5` no da 404.

## Paso 5 · Conectar el frontend con la API (CORS)

1. Copie la URL final del frontend, p. ej. `https://audita-web.vercel.app`.
2. En **audita-api → Settings → Environment Variables**, ponga ese valor en `CORS_ORIGIN`: solo el dominio, sin ruta (`/login`) ni `/` final. Puede incluir varios orígenes separados por coma.
3. En **audita-api → Deployments**, abra el último despliegue y elija **⋯ → Redeploy** para que tome la variable.

## Paso 6 · Crear el administrador

En producción no se crean usuarios automáticamente. Créelo una vez desde su PC, apuntando a la base de Neon con **los mismos secretos** que configuró en Vercel:

```bash
cd backend
npm install
DATABASE_URL="<CADENA_DIRECTA_DE_NEON>" \
JWT_SECRET="<el mismo de Vercel>" \
ORG_HMAC_SECRET="<el mismo de Vercel>" \
CORS_ORIGIN="https://audita-web.vercel.app" \
npm run admin:create -- --nombre "Administrador" --email admin@suempresa.com --password "Cl4ve-Segura!2026"
```

> En PowerShell, defina las variables antes del comando con `$env:DATABASE_URL="..."` (una línea por variable).

Entre en el frontend con ese usuario. Las cuentas de auditor se crean desde la API con `POST /api/auth/usuarios`, como administrador.

## Paso 7 (opcional) · Datos de ejemplo para la demo

El script `demo:seed` entra como auditor, así que primero cree esa cuenta, `auditor@auditsys.co`, con el administrador. Luego, con la API desplegada:

```bash
cd backend
QA_API_URL="https://audita-api.vercel.app/api" \
SEED_AUDITOR_PASSWORD="<contraseña del auditor>" \
npm run demo:seed
```

---

## Verificación final

- [ ] `https://audita-api.vercel.app/api/health` responde `"db": "ok"`.
- [ ] El login funciona en `https://audita-web.vercel.app`.
- [ ] Recargar el navegador en `/auditorias/1` no da 404.
- [ ] Una auditoría cerrada muestra «Cadena íntegra».

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `/api/health` da 500 y el log dice «Variables de entorno inválidas» | Falta un secreto, es demasiado corto o los dos secretos son iguales | Revise el paso 3 y vuelva a desplegar |
| `/api/health` da `FUNCTION_INVOCATION_FAILED` | La API no arrancó; la causa está en *Logs* → clic en la petición → panel inferior (p. ej. `JWT_EXPIRES_IN` con comillas) | Corrija la variable y haga *Redeploy* |
| El login dice «No se pudo conectar con la API» | El frontend se compiló sin `VITE_API_URL` y apunta a `localhost:3000` | Agregue la variable en el proyecto del frontend y haga *Redeploy* |
| El navegador muestra un error de CORS | `CORS_ORIGIN` no coincide exactamente con la URL del frontend | Use la URL exacta, con `https://` y sin `/` final; vuelva a desplegar la API |
| «unsupported startup parameter» en el log | Se está usando la cadena con `-pooler` | Use la cadena directa de Neon |
| El login responde 429 enseguida | Falta `TRUST_PROXY=1`, y todos los usuarios parecen venir de la misma IP | Agréguela y vuelva a desplegar |
| La primera petición tarda unos segundos | Arranque en frío de la función o reactivación de Neon tras inactividad | Es normal en el plan gratuito; abra `/api/health` antes de una demo |
| Todas las cadenas aparecen como alteradas | Se cambió `ORG_HMAC_SECRET` | Restaure el valor original |

## Consideraciones

- **Persistencia:** los datos viven en Neon, no en Vercel. Desplegar de nuevo o reiniciar las funciones no borra nada.
- **Límite de intentos de login:** se guarda en la memoria de cada instancia de la función, así que en Vercel es aproximado. Si el sistema crece, conviene moverlo a un almacén compartido (por ejemplo, Redis de Upstash, también disponible en *Storage*).
- **Plan gratuito:** Vercel Hobby y Neon Free bastan para una demo o un uso académico. Para uso comercial, Vercel exige el plan Pro.

## Alternativa: tres plataformas (Neon + Render + Vercel)

Si prefieren un servidor tradicional para la API en lugar de funciones:

1. **Neon** ([neon.tech](https://neon.tech)): cree el proyecto y ejecute el SQL como en el paso 2.
2. **Render** ([render.com](https://render.com)), en **New → Web Service** con el repositorio:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install --include=dev && npm run build`
   - **Start Command:** `npm start`
   - **Variables:** las del paso 3, con `PG_POOL_MAX=10`.
   - En el plan gratuito, la API se duerme tras 15 minutos sin uso y tarda unos 50 segundos en despertar.
3. **Vercel**: frontend igual que en los pasos 4 y 5, con `VITE_API_URL=https://<servicio>.onrender.com/api`.
4. Administrador y datos de ejemplo igual que en los pasos 6 y 7.
