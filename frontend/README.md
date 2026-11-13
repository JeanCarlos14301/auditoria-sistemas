# AuditA — Frontend

Interfaz web de AuditA. Consume la API de [`backend/`](../backend/) siguiendo su contrato, [`backend/API.md`](../backend/API.md).

**Stack:** React 18 · Vite 6 · TypeScript · Tailwind 3 · React Router 6 · TanStack Query 5

**Movimiento:** GSAP 3.15 · anime.js 4.5 · Motion 14 · three.js r170 (solo el sello en relieve, en diferido)

## Puesta en marcha

Requiere el backend levantado en `http://localhost:3000/api` (ver [backend/README.md](../backend/README.md)).

```bash
cd frontend
npm install
cp .env.example .env     # solo si la API no está en http://localhost:3000/api
npm run dev              # http://localhost:5173
```

Para no partir de una base vacía, con la API en marcha ejecuta `npm run demo:seed` en `backend/`. Crea seis auditorías de ejemplo: una en Borrador, una en ejecución, dos en revisión (una con anomalías de trazabilidad y otra lista para cerrar) y dos cerradas con su informe.

El puerto es fijo (`5173`) porque el backend solo acepta ese origen (`CORS_ORIGIN`). Los usuarios de desarrollo y sus contraseñas están en `backend/.env`; no se escriben en este proyecto.

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Verifica tipos y compila a `dist/` |
| `npm run typecheck` | Verificación de tipos |
| `npm test` | Tests unitarios (Vitest) |

## Qué hay implementado

| Ruta | Pantalla |
|---|---|
| `/login` | **Entrar**: la pantalla entera es la portada de un acta. Junto al formulario, el sello en relieve de una auditoría de ejemplo se compone mientras el pie cuenta cada evento; la luz sigue al cursor y, al entrar, el sello se vuelve a estampar y la hoja se archiva |
| `/auditorias` | **Índice**: los filtros son el resumen (cuántas hay en cada estado); búsqueda por organización o alcance, sin tildes y con la coincidencia resaltada; con «Todas», agrupadas por lo que toca hacer (primero las que están en revisión) y cada fila dice su siguiente paso y lleva a él. Al filtrar, ordenar o buscar, las filas viajan a su sitio |
| `/auditorias/nueva` | **Nueva auditoría** (RF01, CP-02): la hoja en blanco, antes de tener estado |
| `/auditorias/:id` en Borrador | **Alcance** (RF02, CP-03): catálogo con filtro por categoría y contador de 10 a 15 siempre visible |
| `/auditorias/:id` | **Trabajo**: evaluar controles, registrar evidencias, hallazgos y recomendaciones, métricas y postura por atributo |
| `/auditorias/:id/cierre` | **Revisión y cierre**: una sola tabla con la traza de cada control (evidencia, hallazgo, recomendación), agrupada por cláusula. Por defecto enseña solo lo pendiente: cada anomalía que informa la API va en su fila, con el formulario para resolverla ahí mismo; al guardar, la fila se completa y una señal baja a la puerta de cierre, fija abajo, que cuenta las trazas completas y se abre cuando la API dice que se puede cerrar. Al mantener pulsado, la platina recorre la tabla fijando cada fila y la vista pasa al acta. Ya cerrada, **el acta**: empieza por el resultado (cumplimiento sellado, veredicto de integridad, imprimir el informe y el sello en relieve) y sigue con los controles por cláusula, los hallazgos del más grave al menos y la postura por atributo, con un índice en el margen |
| `/auditorias/:id/historia` | **Historia**: la bitácora se reproduce eslabón a eslabón |
| `/auditorias/:id/informe` | **Informe para imprimir** (RF08), solo con la auditoría cerrada: las hojas A4 tal como salen, con la huella del informe al pie de cada una |

El panel (RF09) se cubre con las métricas de cada auditoría.

Todas las pantallas comparten un **marco de documento**: la página es papel a todo el ancho, con una barra fija que dice dónde se está (Auditorías / n.º 7 · Organización / vista) y un pie. Las vistas de una auditoría cuelgan de una ruta contenedora (`src/pages/AuditoriaLayout.tsx`) que pinta una sola vez su cabecera (`src/components/CabeceraAuditoria.tsx`): organización, las cuatro fases con la fecha en que la bitácora registró cada una y las pestañas de las vistas que existen en su estado (Alcance · Trabajo, Revisión e Historia · Acta e Historia).

## Reglas que respeta el código

- **La API es la fuente de verdad.** El cumplimiento se muestra tal como llega; `CountUp` solo anima hasta ese valor y termina exactamente en él. La historia de la auditoría tampoco calcula nada: reproduce lo que cada eslabón de la bitácora dejó escrito (`src/lib/historia.ts`). Si la auditoría se puede cerrar lo decide `GET /trazabilidad`, no el front.
- **Tras cada mutación se recarga el detalle.** Todas las consultas de una auditoría cuelgan de la clave `['auditoria', id]` y cada mutación la invalida entera (`src/api/queries.ts`). Los formularios de registro la invalidan ellos mismos, cuando termina su animación de guardado.
- **Cerrar no tiene vuelta atrás.** Hay que mantener pulsado el botón (también con movimiento reducido) o usar la confirmación en dos pasos.
- **Un 401 cierra la sesión.** El cliente borra el token y avisa a `AuthProvider`, que lleva al login. El token vive en `sessionStorage` y la sesión se restaura con `GET /auth/me`.
- **Validación también en el cliente (RNF03).** Los formularios no envían la petición si falta un campo obligatorio; CP-04 y CP-05 usan el mismo texto que la API. El servidor valida igualmente.
- **El informe impreso sale de la copia sellada.** Se compone con `informe.snapshot_json` (lo que se selló al cerrar) y con la verificación de integridad recién hecha, no con el detalle. Si la verificación falla se puede imprimir igualmente, pero cada hoja sale marcada como «No íntegro».
- **Solo lectura al cerrar.** Una auditoría `CERRADA` redirige al acta y no muestra acciones de edición.
- **Móvil primero (RNF01).** Todo se prueba a 360 px de ancho, sin scroll horizontal.

## Dirección de arte: «Acta»

La herramienta termina convertida en documento. Mientras la auditoría está abierta, la hoja se comporta como un borrador (líneas discontinuas, acciones en cada fila); al cerrar queda fijada y sellada.

- **Tokens** en `src/styles/tokens.css`: tema claro y oscuro, tipografía (Libre Franklin para el texto; Newsreader como acento, solo en la marca, el título de la hoja y la cifra de cumplimiento) y las dos curvas de movimiento.
- **El eslabón que falta.** Cada control lleva su traza: evidencia, hallazgo y recomendación. Donde falta un eslabón, la línea se corta (`src/lib/traza.ts`).
- **El sello.** Un trazo por evento de la bitácora y una roseta generada con el hash final, distinta en cada auditoría (`src/lib/sello.ts`, `src/components/Sello.tsx`). Con la cadena alterada, el sello no cierra. En la entrada y en el acta cerrada se dibuja en relieve con three.js (`src/components/SelloRelieve.tsx`); el sello plano se queda como respaldo mientras carga, si no hay WebGL o si el WebGL es por software (sin GPU un fotograma tarda segundos y congelaría la página). Para probar el relieve en una máquina sin GPU, en desarrollo: `sessionStorage.setItem('audita:relieve-sin-gpu', '1')`.

### Movimiento

- El JS solo escribe **progreso** (`--p`), **índices** y **clases**. El CSS deriva de ahí transformaciones y opacidades con `calc()` y `clamp()` (`src/styles/hoja.css`).
- El JS **nunca toca colores**: todos vienen de tokens.
- En movimiento continuo solo cambian `transform` y `opacity`.
- Dos curvas: entrada `cubic-bezier(.16,1,.3,1)` y cambio de estado `cubic-bezier(.66,0,.1,1)`.
- Con `prefers-reduced-motion` no hay animaciones: se muestra el estado final.
- En móvil no hay pin ni parallax: la historia de la auditoría se recorre con un control deslizante.
- Lo que está fuera de pantalla no se anima (el sello de la entrada y el relieve se pausan).

Cada librería hace una cosa (`src/motion/gsap.ts`, `src/motion/efectos.ts`):

| Librería | Para qué |
|---|---|
| GSAP | Recolocar filas (Flip), historia con pin y scrub (ScrollTrigger), texto por letras (SplitText), la llave del contador (DrawSVG), fichas que caen (Physics2D) |
| anime.js | Entradas escalonadas, también en rejilla desde el centro, y la altura de los trazos del relieve (objetos planos) |
| Motion | Resortes con velocidad: sacudida de error, indicador de pestañas, vuelta del botón de sellar |
| three.js | El sello en relieve de la entrada y del acta cerrada. 125 kB comprimidos en un trozo aparte que se descarga después de pintar la página: el formulario funciona desde el primer momento |

### Impresión

La vista del informe enseña en pantalla las mismas hojas que se imprimen: cada una mide 794 × 1123 px (A4 a 96 ppp) y se escala con `--s` para caber. `src/lib/paginar.ts` reparte los bloques en hojas a partir de sus alturas medidas (los títulos no se quedan solos y las cabeceras de tabla se repiten), y `src/styles/informe.css` trae la hoja de estilos de impresión: fuera la interfaz, una hoja por página y sin los márgenes del navegador. «Imprimir o guardar PDF» abre el diálogo del navegador.

`src/assets/bitacoraEjemplo.ts` es la bitácora (tipo de evento, hash y una frase en lenguaje claro) de una auditoría de prueba local: la usa el sello de la entrada, donde todavía no hay sesión.

## Estructura

```
src/
  api/          tipos del contrato, cliente HTTP (ApiError, 401), endpoints y consultas
  auth/         sesión (AuthProvider) y rutas privadas
  motion/       curvas, movimiento reducido, tween de --p, CountUp, registro de GSAP y gestos comunes
  lib/          formato, lógica de la traza, geometría del sello, historia de la auditoría y paginador (con tests)
  components/   piezas comunes, formularios, sellos (plano, vivo y en relieve), historia, postura, contenido del informe
  pages/        Login, Auditorias, NuevaAuditoria, AuditoriaLayout, Alcance, Trabajo, Cierre (Revision o Acta), HistoriaPagina, Informe
  styles/       tokens y estilos por pantalla
  assets/       bitácora de ejemplo para el sello de la entrada
```
