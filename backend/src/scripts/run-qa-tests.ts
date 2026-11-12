/**
 * Suite automatizada de pruebas QA (CP-01 a CP-13) contra la API real.
 *
 *   Terminal 1: npm run dev
 *   Terminal 2: npm run test:qa
 *
 * Requiere los usuarios sembrados (SEED_DEFAULT_USERS=true en .env).
 * Código de salida: 0 si todas las verificaciones pasan, 1 si alguna falla.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const API = (process.env.QA_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const AUDITOR = {
  email: process.env.SEED_AUDITOR_EMAIL ?? 'auditor@auditsys.co',
  password: process.env.SEED_AUDITOR_PASSWORD ?? '',
};
const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@auditsys.co',
  password: process.env.SEED_ADMIN_PASSWORD ?? '',
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const c = {
  verde: (s: string) => `\x1b[32m${s}\x1b[0m`,
  rojo: (s: string) => `\x1b[31m${s}\x1b[0m`,
  amarillo: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cian: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gris: (s: string) => `\x1b[90m${s}\x1b[0m`,
  negrita: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface Resultado {
  caso: string;
  descripcion: string;
  ok: boolean;
}
const resultados: Resultado[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

interface Respuesta {
  status: number;
  body: Json;
}

async function http(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<Respuesta> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: Json = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* cuerpo no JSON */
  }
  return { status: res.status, body };
}

function seccion(titulo: string): void {
  console.log(`\n${c.negrita(c.cian(`━━ ${titulo} `.padEnd(78, '━')))}`);
}

function verificar(caso: string, descripcion: string, condicion: boolean, detalle?: unknown): boolean {
  resultados.push({ caso, descripcion, ok: condicion });
  const etiqueta = condicion ? c.verde('✔ PASA') : c.rojo('✘ FALLA');
  console.log(`  ${etiqueta}  ${c.negrita(caso.padEnd(6))} ${descripcion}`);
  if (!condicion && detalle !== undefined) {
    console.log(c.gris(`           ↳ ${JSON.stringify(detalle).slice(0, 600)}`));
  }
  return condicion;
}

function info(msg: string): void {
  console.log(c.gris(`           · ${msg}`));
}

/** Aborta la suite si falla un paso del que dependen los siguientes. */
function exigir(condicion: boolean, motivo: string): asserts condicion {
  if (!condicion) {
    console.error(c.rojo(`\n  ABORTADO: ${motivo}`));
    resumen();
    process.exit(1);
  }
}

function resumen(): void {
  const pasan = resultados.filter((r) => r.ok).length;
  const fallan = resultados.length - pasan;
  seccion('RESUMEN');
  const porCaso = new Map<string, boolean>();
  for (const r of resultados) porCaso.set(r.caso, (porCaso.get(r.caso) ?? true) && r.ok);
  for (const [caso, ok] of porCaso) console.log(`  ${ok ? c.verde('✔') : c.rojo('✘')} ${caso}`);
  console.log(
    `\n  Verificaciones: ${resultados.length}  ·  ${c.verde(`${pasan} pasan`)}  ·  ${fallan ? c.rojo(`${fallan} fallan`) : '0 fallan'}`,
  );
  console.log(fallan === 0 ? c.verde(c.negrita('\n  RESULTADO: SUITE QA APROBADA\n')) : c.rojo(c.negrita('\n  RESULTADO: SUITE QA CON FALLOS\n')));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(c.negrita(`\nAuditA · Suite QA CP-01 … CP-13  →  ${API}`));

  // --- Precondición: servidor arriba ---
  try {
    const health = await http('GET', '/health');
    exigir(health.status === 200, `La API respondió ${health.status} en /health`);
  } catch {
    exigir(false, `No se pudo conectar con ${API}. Levante el servidor con "npm run dev".`);
  }
  exigir(Boolean(AUDITOR.password && ADMIN.password), 'Faltan SEED_ADMIN_PASSWORD / SEED_AUDITOR_PASSWORD en .env');

  // --- Login ---
  seccion('AUTENTICACIÓN');
  const loginAuditor = await http('POST', '/auth/login', { body: AUDITOR });
  verificar('LOGIN', `Login auditor (${AUDITOR.email}) -> 200`, loginAuditor.status === 200, loginAuditor.body);
  const loginAdmin = await http('POST', '/auth/login', { body: ADMIN });
  verificar('LOGIN', `Login admin (${ADMIN.email}) -> 200`, loginAdmin.status === 200, loginAdmin.body);
  exigir(loginAuditor.status === 200 && loginAdmin.status === 200, 'Login fallido (¿SEED_DEFAULT_USERS=true y servidor reiniciado?)');
  const tAud: string = loginAuditor.body.token;
  const tAdm: string = loginAdmin.body.token;

  const sinToken = await http('GET', '/auditorias');
  verificar('LOGIN', 'Acceso sin token a /auditorias -> 401', sinToken.status === 401, sinToken.body);

  // --- CP-01 ---
  seccion('CP-01 · Creación válida de auditoría (RF01)');
  const crear = await http('POST', '/auditorias', {
    token: tAud,
    body: {
      organizacion: 'Empresa ABC S.A.S.',
      alcance: 'Evaluación del SGSI de la sede principal según ISO/IEC 27002:2022',
      fecha_inicio: '2026-11-01',
      fecha_fin: '2026-11-30',
    },
  });
  verificar('CP-01', 'POST /auditorias -> 201', crear.status === 201, crear.body);
  verificar('CP-01', "Estado inicial = 'BORRADOR'", crear.body?.estado === 'BORRADOR', crear.body);
  exigir(crear.status === 201, 'No se pudo crear la auditoría base');
  const idAud: number = crear.body.id;
  info(`Auditoría creada id=${idAud}`);

  // --- CP-02 ---
  seccion('CP-02 · Campos obligatorios (RF01)');
  const sinFin = await http('POST', '/auditorias', {
    token: tAud,
    body: { organizacion: 'Empresa ABC S.A.S.', alcance: 'Alcance', fecha_inicio: '2026-11-01' },
  });
  verificar('CP-02', 'Omitir fecha_fin -> 400', sinFin.status === 400, sinFin.body);
  const vacios = await http('POST', '/auditorias', {
    token: tAud,
    body: { organizacion: '   ', alcance: '', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' },
  });
  verificar('CP-02', 'organizacion/alcance vacíos -> 400', vacios.status === 400, vacios.body);
  const fechasInvertidas = await http('POST', '/auditorias', {
    token: tAud,
    body: { organizacion: 'X S.A.', alcance: 'Alcance', fecha_inicio: '2026-11-30', fecha_fin: '2026-11-01' },
  });
  verificar('CP-02', 'fecha_fin < fecha_inicio -> 400', fechasInvertidas.status === 400, fechasInvertidas.body);

  // --- CP-03 ---
  seccion('CP-03 · Alcance normativo 10–15 controles (RF02)');
  const catalogo = await http('GET', '/controles', { token: tAud });
  exigir(catalogo.status === 200 && Array.isArray(catalogo.body) && catalogo.body.length >= 13, 'Catálogo de controles insuficiente');
  const idsCatalogo: number[] = catalogo.body.map((ctrl: Json) => ctrl.id);
  info(`Catálogo ISO/IEC 27002:2022 con ${idsCatalogo.length} controles`);

  const nueve = await http('POST', `/auditorias/${idAud}/alcance`, { token: tAud, body: { ids_controles: idsCatalogo.slice(0, 9) } });
  verificar('CP-03', '9 controles (infra-límite) -> 400', nueve.status === 400 && String(nueve.body?.error).startsWith('CP-03'), nueve.body);

  const dieciseis = Array.from({ length: 16 }, (_, i) => i + 1);
  const supra = await http('POST', `/auditorias/${idAud}/alcance`, { token: tAud, body: { ids_controles: dieciseis } });
  verificar('CP-03', '16 controles (supra-límite) -> 400', supra.status === 400 && String(supra.body?.error).startsWith('CP-03'), supra.body);

  const duplicados = [...idsCatalogo.slice(0, 9), ...idsCatalogo.slice(0, 3)];
  const dup = await http('POST', `/auditorias/${idAud}/alcance`, { token: tAud, body: { ids_controles: duplicados } });
  verificar('CP-03', '12 IDs con duplicados (9 únicos) -> 400', dup.status === 400, dup.body);

  const idsAlcance = idsCatalogo.slice(0, 13);
  const alcance = await http('POST', `/auditorias/${idAud}/alcance`, { token: tAud, body: { ids_controles: idsAlcance } });
  verificar('CP-03', '13 controles -> 200', alcance.status === 200, alcance.body);
  verificar('CP-03', "Estado pasa a 'EN_EJECUCION'", alcance.body?.auditoria?.estado === 'EN_EJECUCION', alcance.body);
  verificar('CP-03', '13 evaluaciones creadas', alcance.body?.total_controles === 13, alcance.body);
  exigir(alcance.status === 200, 'No se pudo definir el alcance');

  const detalle = await http('GET', `/auditorias/${idAud}`, { token: tAud });
  exigir(detalle.status === 200 && detalle.body.evaluaciones.length === 13, 'Detalle de auditoría inválido');
  const evals: { id: number; codigo: string }[] = detalle.body.evaluaciones.map((e: Json) => ({ id: e.id, codigo: e.control.codigo_iso }));
  info(`Controles en alcance: ${evals.map((e) => e.codigo).join(', ')}`);

  const implementados = evals.slice(0, 4);
  const parciales = evals.slice(4, 9);
  const noImplementados = evals.slice(9, 12);
  const noAplicable = evals[12]!;

  // --- CP-04 ---
  seccion('CP-04 · Observaciones obligatorias (RF03)');
  const p0 = parciales[0]!;
  const sinObs = await http('PATCH', `/evaluaciones/${p0.id}`, { token: tAud, body: { estado: 'PARCIALMENTE_IMPLEMENTADO' } });
  verificar('CP-04', 'PARCIALMENTE_IMPLEMENTADO sin observaciones -> 400', sinObs.status === 400 && String(sinObs.body?.error).startsWith('CP-04'), sinObs.body);
  const obsCorta = await http('PATCH', `/evaluaciones/${p0.id}`, {
    token: tAud,
    body: { estado: 'NO_IMPLEMENTADO', observaciones: '  ab  ' },
  });
  verificar('CP-04', 'NO_IMPLEMENTADO con observación < 5 caracteres reales -> 400', obsCorta.status === 400 && String(obsCorta.body?.error).startsWith('CP-04'), obsCorta.body);

  // --- CP-05 ---
  seccion('CP-05 · Justificación de No Aplicable (RF03)');
  const sinJust = await http('PATCH', `/evaluaciones/${noAplicable.id}`, { token: tAud, body: { estado: 'NO_APLICABLE' } });
  verificar('CP-05', 'NO_APLICABLE sin justificacion_na -> 400', sinJust.status === 400 && String(sinJust.body?.error).startsWith('CP-05'), sinJust.body);

  // --- CP-06 ---
  seccion('CP-06 · Disonancia probatoria: IMPLEMENTADO sin evidencia (RNF05)');
  const i0 = implementados[0]!;
  const evalImpl = await http('PATCH', `/evaluaciones/${i0.id}`, { token: tAud, body: { estado: 'IMPLEMENTADO' } });
  verificar('CP-06', `Control ${i0.codigo} marcado IMPLEMENTADO -> 200`, evalImpl.status === 200, evalImpl.body);
  const cierre06 = await http('PATCH', `/auditorias/${idAud}/estado`, { token: tAud, body: { estado: 'CERRADA' } });
  const disonancia = (cierre06.body?.anomalias ?? []).some(
    (a: Json) => a.tipo === 'CP-06_DISONANCIA_PROBATORIA' && a.id_evaluacion === i0.id,
  );
  verificar('CP-06', 'Intento de cierre -> 422', cierre06.status === 422, cierre06.body);
  verificar('CP-06', `Anomalía CP-06 reportada para ${i0.codigo}`, disonancia, cierre06.body?.anomalias);

  // --- CP-08 ---
  seccion('CP-08 · Orfandad de registros: hallazgo sin recomendación (RNF05)');
  for (const e of implementados) {
    const ev = await http('POST', `/evaluaciones/${e.id}/evidencias`, {
      token: tAud,
      body: {
        descripcion: `Evidencia documental del control ${e.codigo}`,
        fuente: 'DOCUMENTAL',
        fecha_recoleccion: '2026-11-10',
        referencia_archivo: `evidencias/${e.codigo}.pdf`,
      },
    });
    verificar('CP-08', `Evidencia registrada para ${e.codigo} (checksum SHA-256)`, ev.status === 201 && /^[0-9a-f]{64}$/.test(ev.body?.checksum_sha256), ev.body);
  }
  const fuenteInvalida = await http('POST', `/evaluaciones/${i0.id}/evidencias`, {
    token: tAud,
    body: { descripcion: 'x', fuente: 'RUMOR' },
  });
  verificar('CP-08', 'Evidencia con fuente inválida -> 400', fuenteInvalida.status === 400, fuenteInvalida.body);

  for (const e of implementados.slice(1)) {
    const r = await http('PATCH', `/evaluaciones/${e.id}`, { token: tAud, body: { estado: 'IMPLEMENTADO' } });
    verificar('CP-08', `${e.codigo} -> IMPLEMENTADO`, r.status === 200, r.body);
  }
  for (const e of parciales) {
    const r = await http('PATCH', `/evaluaciones/${e.id}`, {
      token: tAud,
      body: { estado: 'PARCIALMENTE_IMPLEMENTADO', observaciones: `Implementación incompleta del control ${e.codigo}.` },
    });
    verificar('CP-08', `${e.codigo} -> PARCIALMENTE_IMPLEMENTADO`, r.status === 200, r.body);
  }
  for (const e of noImplementados) {
    const r = await http('PATCH', `/evaluaciones/${e.id}`, {
      token: tAud,
      body: { estado: 'NO_IMPLEMENTADO', observaciones: `No existe evidencia del control ${e.codigo}.` },
    });
    verificar('CP-08', `${e.codigo} -> NO_IMPLEMENTADO`, r.status === 200, r.body);
  }
  const na = await http('PATCH', `/evaluaciones/${noAplicable.id}`, {
    token: tAud,
    body: { estado: 'NO_APLICABLE', justificacion_na: 'La organización no opera infraestructura propia para este control.' },
  });
  verificar('CP-08', `${noAplicable.codigo} -> NO_APLICABLE con justificación`, na.status === 200, na.body);

  // Hallazgos ISO 19011 para parciales y no implementados (8). El primero sin criterio -> autocompletado.
  const conHallazgo = [...parciales, ...noImplementados];
  const hallazgos: number[] = [];
  for (const [i, e] of conHallazgo.entries()) {
    const h = await http('POST', `/evaluaciones/${e.id}/hallazgos`, {
      token: tAud,
      body: {
        condicion: `Se observó que el control ${e.codigo} no opera de forma consistente.`,
        ...(i === 0 ? {} : { criterio: `Requisito del control ${e.codigo} de ISO/IEC 27002:2022` }),
        causa: 'Ausencia de un procedimiento formal y de un responsable asignado.',
        efecto_riesgo: 'Exposición a accesos no autorizados y pérdida de integridad de la información.',
        severidad: (['ALTA', 'MEDIA', 'BAJA'] as const)[i % 3],
      },
    });
    verificar('CP-08', `Hallazgo ISO 19011 en ${e.codigo} -> 201`, h.status === 201, h.body);
    if (i === 0) {
      verificar('CP-08', 'Criterio autocompletado desde el control ISO', String(h.body?.criterio).includes(e.codigo), h.body?.criterio);
    }
    hallazgos.push(h.body?.id);
  }

  const huerfano = hallazgos[hallazgos.length - 1]!;
  for (const idH of hallazgos.slice(0, -1)) {
    const r = await http('POST', `/hallazgos/${idH}/recomendaciones`, {
      token: tAud,
      body: { descripcion: 'Formalizar e implementar el procedimiento del control.', prioridad: 'ALTA', plazo_estimado: '90 días' },
    });
    verificar('CP-08', `Recomendación para hallazgo #${idH} -> 201`, r.status === 201, r.body);
  }

  const cierre08 = await http('PATCH', `/auditorias/${idAud}/estado`, { token: tAud, body: { estado: 'CERRADA' } });
  const anomalias08: Json[] = cierre08.body?.anomalias ?? [];
  verificar('CP-08', 'Intento de cierre con hallazgo huérfano -> 422', cierre08.status === 422, cierre08.body);
  verificar(
    'CP-08',
    `Única anomalía: CP-08 en hallazgo #${huerfano}`,
    anomalias08.length === 1 && anomalias08[0]?.tipo === 'CP-08_HALLAZGO_HUERFANO' && anomalias08[0]?.id_hallazgo === huerfano,
    anomalias08,
  );

  // --- CP-09 ---
  seccion('CP-09 · Verificación matemática exacta (RF07)');
  const recFinal = await http('POST', `/hallazgos/${huerfano}/recomendaciones`, {
    token: tAud,
    body: { descripcion: 'Asignar responsable y documentar el control.', prioridad: 'MEDIA', plazo_estimado: '60 días' },
  });
  verificar('CP-09', `Recomendación para hallazgo huérfano #${huerfano} -> 201`, recFinal.status === 201, recFinal.body);

  const metricas = await http('GET', `/auditorias/${idAud}/metricas`, { token: tAud });
  const m = metricas.body ?? {};
  info(`Implementados=${m.implementados} Parciales=${m.parciales} NoImpl=${m.no_implementados} NA=${m.no_aplicables} Aplicables=${m.total_aplicables}`);
  verificar(
    'CP-09',
    'Distribución 4 IMPL / 5 PARCIAL / 3 NO_IMPL / 1 NA',
    m.implementados === 4 && m.parciales === 5 && m.no_implementados === 3 && m.no_aplicables === 1,
    m,
  );
  verificar('CP-09', 'Denominador excluye NO_APLICABLE: total_aplicables = 12', m.total_aplicables === 12, m);
  verificar('CP-09', `cumplimiento_pct === 33.3  (4 / 12 × 100)  → obtenido ${m.cumplimiento_pct}`, m.cumplimiento_pct === 33.3, m);
  verificar('CP-09', 'Hallazgos por severidad suman 8', m.hallazgos?.total === 8, m.hallazgos);

  const traz = await http('GET', `/auditorias/${idAud}/trazabilidad`, { token: tAud });
  verificar('CP-09', 'Trazabilidad sin anomalías (apta para cierre)', traz.body?.apta_para_cierre === true, traz.body);

  const listado = await http('GET', '/auditorias', { token: tAud });
  const enListado = (listado.body ?? []).find((a: Json) => a.id === idAud);
  verificar('CP-09', 'Listado expone cumplimiento_pct = 33.3', enListado?.cumplimiento_pct === 33.3, enListado);

  const vistaAdmin = await http('GET', `/auditorias/${idAud}`, { token: tAdm });
  verificar('CP-09', 'Admin puede consultar la auditoría del auditor', vistaAdmin.status === 200, vistaAdmin.body);

  // --- CP-13 ---
  seccion('CP-13 · Seguridad RBAC y estado inmutable');
  const controlNuevo = await http('POST', '/controles', {
    token: tAud,
    body: {
      codigo_iso: '8.16',
      clausula: 8,
      categoria_tema: 'Tecnológicos',
      nombre: 'Actividades de monitoreo',
      criterio_evaluacion: '¿Se monitorean redes y sistemas?',
      ejemplo_evidencia: 'Paneles de monitoreo',
      attr_tipo_control: 'Detectivo',
      attr_propiedades_cia: 'Confidencialidad, Integridad, Disponibilidad',
      attr_concepto_nist: 'Detectar',
      attr_capacidad_operativa: 'Gestión de eventos',
      attr_dominio_seguridad: 'Defensa',
    },
  });
  verificar('CP-13', 'Auditor -> POST /controles -> 403', controlNuevo.status === 403, controlNuevo.body);

  const cierre = await http('PATCH', `/auditorias/${idAud}/estado`, { token: tAud, body: { estado: 'CERRADA' } });
  verificar('CP-13', 'Cierre de auditoría -> 200', cierre.status === 200, cierre.body);
  verificar('CP-13', "Estado final = 'CERRADA'", cierre.body?.auditoria?.estado === 'CERRADA', cierre.body);
  verificar(
    'CP-13',
    'Informe generado (cumplimiento 33.3 y hash de integridad de 64 hex)',
    cierre.body?.informe?.cumplimiento_pct === 33.3 && /^[0-9a-f]{64}$/.test(cierre.body?.informe?.hash_integridad ?? ''),
    cierre.body?.informe,
  );

  const modificar = await http('PATCH', `/evaluaciones/${i0.id}`, {
    token: tAud,
    body: { estado: 'NO_IMPLEMENTADO', observaciones: 'Intento de alteración posterior al cierre.' },
  });
  verificar('CP-13', 'PATCH /evaluaciones/:id sobre auditoría CERRADA -> 403', modificar.status === 403, modificar.body);

  const evidenciaTardia = await http('POST', `/evaluaciones/${i0.id}/evidencias`, {
    token: tAud,
    body: { descripcion: 'Evidencia tardía', fuente: 'ENTREVISTA' },
  });
  verificar('CP-13', 'POST evidencia sobre auditoría CERRADA -> 403', evidenciaTardia.status === 403, evidenciaTardia.body);

  const recTardia = await http('POST', `/hallazgos/${huerfano}/recomendaciones`, {
    token: tAdm,
    body: { descripcion: 'Tardía', prioridad: 'BAJA', plazo_estimado: '30 días' },
  });
  verificar('CP-13', 'POST recomendación (incluso como admin) sobre auditoría CERRADA -> 403', recTardia.status === 403, recTardia.body);

  const reabrir = await http('PATCH', `/auditorias/${idAud}/estado`, { token: tAdm, body: { estado: 'EN_EJECUCION' } });
  verificar('CP-13', 'Reabrir auditoría CERRADA -> 403', reabrir.status === 403, reabrir.body);

  const integridad = await http('GET', `/auditorias/${idAud}/verificar-integridad`, { token: tAud });
  verificar('CP-13', 'GET /verificar-integridad -> integra === true', integridad.body?.integra === true, integridad.body?.cadena);
  verificar('CP-13', 'Informe anclado al último eslabón (CIERRE_INFORME)', integridad.body?.informe?.integro === true, integridad.body?.informe);

  const informe = await http('GET', `/auditorias/${idAud}/informe`, { token: tAud });
  verificar('CP-13', 'GET /informe -> verificación en vivo íntegra', informe.status === 200 && informe.body?.verificacion?.integra === true, informe.body?.verificacion);

  const eslabones: Json[] = integridad.body?.eslabones ?? [];
  console.log(`\n  ${c.negrita('Hash Chain forense')} (${eslabones.length} eslabones, ${integridad.body?.algoritmo})`);
  for (const e of eslabones) {
    console.log(c.gris(`    #${String(e.id).padStart(4)}  ${e.tipo_evento.padEnd(24)} ${e.hash_actual.slice(0, 16)}…`));
  }
  console.log(`\n  ${c.negrita('Hash SHA-256 final de la cadena:')} ${c.amarillo(integridad.body?.hash_final ?? '—')}`);
  console.log(`  ${c.negrita('Hash de integridad del informe:')}  ${c.amarillo(informe.body?.informe?.hash_integridad ?? '—')}`);

  resumen();
  process.exit(resultados.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error(c.rojo('\nError inesperado en la suite QA:'), err);
  process.exit(1);
});
