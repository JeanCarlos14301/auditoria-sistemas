# Evidencias del sistema — AuditA

Capturas del frontend tomadas con el sistema en ejecución: backend, PostgreSQL 16 en Docker y frontend en `http://localhost:5173`. Los datos provienen de `npm run demo:seed`, que crea seis auditorías de ejemplo, una en cada etapa del flujo.

- **Navegador:** Microsoft Edge, 1440 × 900 px (las hojas del informe a 2×).
- **Movimiento reducido:** las pantallas muestran su estado final, sin animaciones a medio camino.
- **Usuario:** `auditor@auditsys.co` (rol auditor).

[← Volver al README](../README.md)

---

## 1. Acceso al sistema

![Login](capturas/01-login.png)

Inicio de sesión con JWT. No hay registro público: las cuentas las crea un administrador. El sello de la derecha se genera a partir de la bitácora de una auditoría de ejemplo.

## 2. Dashboard (RF09)

**Métricas de una auditoría en curso.** El panel derecho muestra el cumplimiento, la distribución por estado y los hallazgos por severidad. Abajo, la postura por atributo ISO/IEC 27002 (cláusula, tipo de control, propiedad, concepto NIST y dominio).

![Panel de métricas](capturas/03a-dashboard-metricas-auditoria.png)

**Resultado de una auditoría cerrada:** cumplimiento sellado, veredicto de integridad y sello en relieve.

![Resultado de auditoría cerrada](capturas/03b-dashboard-resultado-cerrada.png)

## 3. Listado de auditorías

Filtros por estado (que hacen de resumen), búsqueda, orden y, en cada fila, el cumplimiento y el siguiente paso.

![Listado de auditorías](capturas/02-listado-auditorias.png)

## 4. Creación y configuración de la auditoría (RF01 · CP-01 · CP-02)

Organización, alcance y periodo. La aplicación avisa si las fechas están invertidas y calcula la duración. La auditoría nace en estado **Borrador**.

![Creación de auditoría](capturas/04-creacion-auditoria.png)

## 5. Selección de controles (RF02 · CP-03)

Catálogo ISO/IEC 27002:2022 con búsqueda y filtro por cláusula.

![Catálogo de controles](capturas/05a-seleccion-controles-catalogo.png)

Con 12 controles marcados, el contador valida el rango de 10 a 15 («Alcance válido») antes de confirmar.

![12 controles seleccionados](capturas/05b-seleccion-controles-12-elegidos.png)

## 6. Evaluación de controles (RF03 · CP-04 · CP-05)

Para cada control, el criterio de evaluación y la evidencia esperada; el estado (Implementado, Parcial, No implementado o No aplica) con sus observaciones; y la traza que ese estado exige para poder cerrar.

![Evaluación de control](capturas/06-evaluacion-control.png)

## 7. Registro de evidencias (RF04)

Evidencias registradas, cada una con su fuente, fecha, referencia y checksum SHA-256:

![Evidencias registradas](capturas/07a-evidencias-registradas.png)

Formulario de registro con descripción, **fuente** (documental, entrevista u observación técnica), **fecha de recolección** y referencia del archivo:

![Formulario de evidencia](capturas/07b-registro-evidencia-formulario.png)

## 8. Hallazgos y recomendaciones (RF05 · RF06)

Hallazgo con la estructura de ISO 19011:2018 (condición, causa, efecto y severidad) y su recomendación, con prioridad y plazo:

![Hallazgos y recomendaciones](capturas/08a-hallazgos-y-recomendaciones.png)

Registro de un hallazgo. El **criterio** se toma automáticamente del control ISO evaluado:

![Formulario de hallazgo](capturas/08b-registro-hallazgo-iso19011.png)

## 9. Revisión de trazabilidad y cierre (RNF05 · CP-06 · CP-08 · RF08)

Auditoría con anomalías: un control implementado sin evidencia (CP-06), un control no implementado sin hallazgo y un hallazgo sin recomendación (CP-08). Cada anomalía se resuelve desde su fila, y el cierre permanece bloqueado mientras quede alguna.

![Revisión con anomalías](capturas/09a-revision-trazabilidad-anomalias.png)

Auditoría con todas las trazas completas: el cierre se habilita (mantener pulsado para sellar).

![Lista para cerrar](capturas/09b-revision-lista-para-cerrar.png)

Acta de la auditoría cerrada: resultado, controles por cláusula, hallazgos ordenados por severidad y postura por atributo.

![Acta cerrada](capturas/10a-acta-cerrada.png)

## 10. Informe generado (RF08)

Vista del informe imprimible: hojas A4 tal como salen impresas, con la huella de integridad al pie de cada una.

![Vista del informe](capturas/10b-informe-generado.png)

| Hoja | Contenido |
|---|---|
| [Hoja 1](capturas/10c-informe-hoja-01.png) | Portada: datos de la auditoría, cumplimiento, sello y verificación de integridad |
| [Hoja 2](capturas/10c-informe-hoja-02.png) | Resultados por control |
| [Hoja 3](capturas/10c-informe-hoja-03.png) | Observaciones y evidencias |
| [Hoja 4](capturas/10c-informe-hoja-04.png) | Evidencias (continuación) |
| [Hoja 5](capturas/10c-informe-hoja-05.png) | Hallazgos y recomendaciones (ISO 19011) |
| [Hoja 6](capturas/10c-informe-hoja-06.png) | Hallazgos (continuación) |
| [Hoja 7](capturas/10c-informe-hoja-07.png) | Hallazgos (continuación) |
| [Hoja 8](capturas/10c-informe-hoja-08.png) | Anexo: bitácora de la auditoría con el hash de cada eslabón |
| [Hoja 9](capturas/10c-informe-hoja-09.png) | Anexo (continuación) |

![Portada del informe](capturas/10c-informe-hoja-01.png)

![Hallazgos en el informe](capturas/10c-informe-hoja-05.png)

![Anexo de bitácora](capturas/10c-informe-hoja-08.png)

## 11. Verificación de integridad (Hash Chain)

Veredicto de integridad en vivo: «Cadena íntegra», con los eslabones verificados y los cinco checks (cadena válida, eslabón de cierre presente, cierre como último eslabón, snapshot sin alterar y métricas coincidentes con las selladas).

![Verificación de integridad](capturas/11a-verificacion-integridad.png)

Historia de la auditoría: la bitácora se reproduce eslabón a eslabón, con el hash y la marca de tiempo de cada evento.

![Bitácora Hash Chain](capturas/11b-bitacora-hash-chain.png)
