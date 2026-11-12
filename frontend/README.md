# AuditA — Frontend

Interfaz web de AuditA. Consume la API de [`backend/`](../backend/) siguiendo su contrato, [`backend/API.md`](../backend/API.md).

**Stack:** React 18 · Vite 6 · TypeScript · Tailwind 3 · React Router 6 · TanStack Query 5

## Puesta en marcha

Requiere el backend levantado en `http://localhost:3000/api` (ver [backend/README.md](../backend/README.md)).

```bash
cd frontend
npm install
cp .env.example .env     # solo si la API no está en http://localhost:3000/api
npm run dev              # http://localhost:5173
```

El puerto es fijo (`5173`) porque el backend solo acepta ese origen (`CORS_ORIGIN`). Los usuarios de desarrollo y sus contraseñas están en `backend/.env`; no se escriben en este proyecto.

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Verifica tipos y compila a `dist/` |
| `npm run typecheck` | Verificación de tipos |
| `npm test` | Tests unitarios (Vitest) |

## Qué hay implementado

| Ruta | Pantalla | Estado |
|---|---|---|
| `/auditorias/:id` | **Trabajo**: evaluar controles, registrar evidencias, hallazgos y recomendaciones, métricas | Diseño aprobado |
| `/auditorias/:id/cierre` | **Revisión y cierre**: la traza de cada control, la puerta de cierre y el sello de integridad | Diseño aprobado |
| `/login` | Inicio de sesión | Funcional, diseño pendiente |
| `/auditorias` | Listado | Funcional, diseño pendiente |

Pendientes: nueva auditoría (RF01), alcance con filtro y contador de 10 a 15 (RF02), panel (RF09) y vista de impresión del informe (RF08).

## Reglas que respeta el código

- **La API es la fuente de verdad.** El cumplimiento se muestra tal como llega; `CountUp` solo anima el paso del valor anterior al nuevo y termina exactamente en él. Si la auditoría se puede cerrar lo decide `GET /trazabilidad`, no el front.
- **Tras cada mutación se recarga el detalle.** Todas las consultas de una auditoría cuelgan de la clave `['auditoria', id]` y cada mutación la invalida entera (`src/api/queries.ts`).
- **Un 401 cierra la sesión.** El cliente borra el token y avisa a `AuthProvider`, que lleva al login. El token vive en `sessionStorage` y la sesión se restaura con `GET /auth/me`.
- **Validación también en el cliente (RNF03).** Los formularios no envían la petición si falta un campo obligatorio; CP-04 y CP-05 usan el mismo texto que la API. El servidor valida igualmente.
- **Solo lectura al cerrar.** Una auditoría `CERRADA` redirige al acta y no muestra acciones de edición.
- **Móvil primero (RNF01).** Todo se prueba a 360 px de ancho, sin scroll horizontal.

## Dirección de arte: «Acta»

La herramienta termina convertida en documento. Mientras la auditoría está abierta, la hoja se comporta como un borrador (líneas discontinuas, acciones en cada fila); al cerrar queda fijada y sellada.

- **Tokens** en `src/styles/tokens.css`: tema claro y oscuro, tipografía (Libre Franklin para el texto; Newsreader como acento, solo en la marca, el título de la hoja y la cifra de cumplimiento) y las dos curvas de movimiento.
- **El eslabón que falta.** Cada control lleva su traza: evidencia, hallazgo y recomendación. Donde falta un eslabón, la línea se corta (`src/lib/traza.ts`).
- **El sello.** Un trazo por evento de la bitácora y una roseta generada con el hash final, distinta en cada auditoría (`src/lib/sello.ts`, `src/components/Sello.tsx`). Con la cadena alterada, el sello no cierra.

### Movimiento

- El JS solo escribe **progreso** (`--p`), **índices** y **clases**. El CSS deriva de ahí transformaciones y opacidades con `calc()` y `clamp()` (`src/styles/hoja.css`).
- El JS **nunca toca colores**: todos vienen de tokens.
- En movimiento continuo solo cambian `transform` y `opacity`.
- Dos curvas: entrada `cubic-bezier(.16,1,.3,1)` y cambio de estado `cubic-bezier(.66,0,.1,1)`.
- Con `prefers-reduced-motion` no hay animaciones: se muestra el estado final.
- No hay librerías de animación: `src/motion/motion.ts` cubre lo que usan estas dos pantallas. Si una pantalla futura necesita scroll con pin, se añadirá GSAP ahí.

## Estructura

```
src/
  api/          tipos del contrato, cliente HTTP (ApiError, 401), endpoints y consultas
  auth/         sesión (AuthProvider) y rutas privadas
  motion/       curvas, helpers de movimiento reducido, tween de --p y CountUp
  lib/          formato, lógica de la traza y geometría del sello (con tests)
  components/   piezas comunes, formularios de registro, sello y marco de la app
  pages/        Login, Auditorias, Trabajo, Cierre
  styles/       tokens y estilos por pantalla
```
