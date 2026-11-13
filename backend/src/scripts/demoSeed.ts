/**
 * Crea auditorías de ejemplo, una en cada momento del flujo, para recorrer el frontend sin rellenarlas a mano.
 *
 *   Terminal 1: npm run dev
 *   Terminal 2: npm run demo:seed
 *
 * Todo pasa por la API (como el frontend), así que la bitácora y los informes se generan como en un uso real.
 * Requiere el usuario auditor sembrado (SEED_DEFAULT_USERS=true en .env). No se ejecuta con NODE_ENV=production.
 * Se puede repetir: salta las organizaciones de ejemplo que ya existan.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const API = (process.env.QA_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const FRONT = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim().replace(/\/$/, '');
const AUDITOR = { email: process.env.SEED_AUDITOR_EMAIL ?? 'auditor@auditsys.co', password: process.env.SEED_AUDITOR_PASSWORD ?? '' };

type Estado = 'IMPLEMENTADO' | 'PARCIALMENTE_IMPLEMENTADO' | 'NO_IMPLEMENTADO' | 'NO_APLICABLE';
type Nivel = 'ALTA' | 'MEDIA' | 'BAJA';
type Fuente = 'DOCUMENTAL' | 'ENTREVISTA' | 'OBSERVACION_TECNICA';

// ---------------------------------------------------------------------------
// Contenido por control: lo que un auditor escribiría para cada uno
// ---------------------------------------------------------------------------

interface Contenido {
  evidencia: { descripcion: string; fuente: Fuente; referencia_archivo: string };
  /** Observación del auditor cuando el control no está implementado del todo. */
  observacion: string;
  hallazgo: { condicion: string; causa: string; efecto_riesgo: string; severidad: Nivel };
  recomendacion: { descripcion: string; prioridad: Nivel; plazo_estimado: string };
  /** Justificación si el control se declara no aplicable. */
  noAplica?: string;
}

const CONTENIDO: Record<string, Contenido> = {
  '5.1': {
    evidencia: { descripcion: 'Política de seguridad de la información v3.2, aprobada por el comité directivo y publicada en la intranet', fuente: 'DOCUMENTAL', referencia_archivo: 'evidencias/5.1-politica-seguridad-v3.2.pdf' },
    observacion: 'La política existe pero no se ha revisado desde 2023 ni se ha comunicado a contratistas.',
    hallazgo: { condicion: 'La política de seguridad vigente no se revisa desde marzo de 2023 y no consta su comunicación a contratistas.', causa: 'No hay un responsable asignado ni un calendario de revisión anual.', efecto_riesgo: 'Las directrices pueden no reflejar los riesgos actuales y el personal externo las desconoce.', severidad: 'MEDIA' },
    recomendacion: { descripcion: 'Asignar un responsable de la política, fijar una revisión anual y registrar la aceptación por parte de contratistas.', prioridad: 'MEDIA', plazo_estimado: '60 días' },
  },
  '5.15': {
    evidencia: { descripcion: 'Procedimiento de control de acceso lógico y matriz de roles por aplicación', fuente: 'DOCUMENTAL', referencia_archivo: 'evidencias/5.15-matriz-roles.xlsx' },
    observacion: 'La matriz de roles cubre el ERP, pero no las aplicaciones en la nube.',
    hallazgo: { condicion: 'Las aplicaciones en la nube (CRM y correo) no están incluidas en la matriz de roles.', causa: 'La matriz se definió antes de la migración a servicios en la nube y no se ha actualizado.', efecto_riesgo: 'Usuarios con permisos superiores a los necesarios en sistemas con datos de clientes.', severidad: 'ALTA' },
    recomendacion: { descripcion: 'Incorporar las aplicaciones en la nube a la matriz de roles y revisar los permisos actuales contra ella.', prioridad: 'ALTA', plazo_estimado: '45 días' },
  },
  '5.18': {
    evidencia: { descripcion: 'Actas de la revisión trimestral de derechos de acceso firmadas por los jefes de área', fuente: 'DOCUMENTAL', referencia_archivo: 'evidencias/5.18-revision-accesos-T3.pdf' },
    observacion: 'Las bajas de personal se comunican a TI con retraso de hasta dos semanas.',
    hallazgo: { condicion: 'En la muestra de 15 bajas, 6 cuentas siguieron activas más de 10 días después de la salida del empleado.', causa: 'Recursos Humanos notifica las bajas por correo, sin un flujo formal ni plazo.', efecto_riesgo: 'Antiguos empleados pueden seguir accediendo a información de la organización.', severidad: 'ALTA' },
    recomendacion: { descripcion: 'Automatizar la notificación de bajas desde el sistema de nómina y desactivar las cuentas el mismo día.', prioridad: 'ALTA', plazo_estimado: '30 días' },
  },
  '5.24': {
    evidencia: { descripcion: 'Plan de respuesta a incidentes con roles, contactos y el informe del simulacro de agosto', fuente: 'DOCUMENTAL', referencia_archivo: 'evidencias/5.24-plan-incidentes.pdf' },
    observacion: 'El plan existe, pero no se ha probado y faltan los contactos de proveedores críticos.',
    hallazgo: { condicion: 'El plan de respuesta a incidentes no se ha ejecutado nunca en un simulacro.', causa: 'No hay un calendario de pruebas aprobado.', efecto_riesgo: 'Ante un incidente real, los tiempos de respuesta y la coordinación son inciertos.', severidad: 'MEDIA' },
    recomendacion: { descripcion: 'Programar un simulacro semestral y actualizar el plan con las lecciones aprendidas.', prioridad: 'MEDIA', plazo_estimado: '90 días' },
  },
  '6.3': {
    evidencia: { descripcion: 'Registro de asistencia a la formación anual en seguridad y resultados de la campaña de phishing simulado', fuente: 'DOCUMENTAL', referencia_archivo: 'evidencias/6.3-formacion-2026.xlsx' },
    observacion: 'Solo el 58 % del personal completó la formación anual.',
    hallazgo: { condicion: 'El 42 % del personal no completó la formación anual en seguridad y el 18 % cayó en la campaña de phishing simulado.', causa: 'La formación no es obligatoria ni se hace seguimiento de quién la completa.', efecto_riesgo: 'Mayor probabilidad de incidentes por ingeniería social.', severidad: 'ALTA' },
    recomendacion: { descripcion: 'Hacer obligatoria la formación anual, con seguimiento mensual por área y refuerzo para quien falle el simulacro.', prioridad: 'ALTA', plazo_estimado: '90 días' },
  },
  '7.2': {
    evidencia: { descripcion: 'Inspección del control de acceso por tarjeta en la entrada principal y en el centro de datos', fuente: 'OBSERVACION_TECNICA', referencia_archivo: 'evidencias/7.2-inspeccion-accesos.jpg' },
    observacion: 'La puerta del centro de datos permanece abierta en horario laboral.',
    hallazgo: { condicion: 'La puerta del centro de datos se mantiene abierta con una cuña durante el horario laboral.', causa: 'El personal de soporte la deja abierta por comodidad y nadie lo supervisa.', efecto_riesgo: 'Acceso físico no autorizado a los servidores.', severidad: 'MEDIA' },
    recomendacion: { descripcion: 'Instalar un cierre automático con alarma de puerta abierta y registrar cada acceso al centro de datos.', prioridad: 'MEDIA', plazo_estimado: '30 días' },
  },
  '7.4': {
    evidencia: { descripcion: 'Contrato de vigilancia y grabaciones de las cámaras de los últimos 30 días', fuente: 'OBSERVACION_TECNICA', referencia_archivo: 'evidencias/7.4-cctv.pdf' },
    observacion: 'Las cámaras graban, pero nadie revisa las alertas fuera de horario.',
    hallazgo: { condicion: 'Las alertas de movimiento de las cámaras fuera de horario no se revisan.', causa: 'El contrato de vigilancia no incluye la monitorización remota.', efecto_riesgo: 'Una intrusión nocturna podría pasar inadvertida hasta el día siguiente.', severidad: 'BAJA' },
    recomendacion: { descripcion: 'Ampliar el contrato de vigilancia para atender las alertas fuera de horario.', prioridad: 'BAJA', plazo_estimado: '120 días' },
  },
  '8.5': {
    evidencia: { descripcion: 'Configuración de la autenticación multifactor en el directorio corporativo', fuente: 'OBSERVACION_TECNICA', referencia_archivo: 'evidencias/8.5-mfa-config.png' },
    observacion: 'La autenticación multifactor solo está activa para administradores.',
    hallazgo: { condicion: 'La autenticación multifactor solo protege las cuentas de administración; el resto usa solo contraseña.', causa: 'El despliegue se detuvo tras la primera fase por quejas de los usuarios.', efecto_riesgo: 'Una contraseña filtrada basta para entrar al correo y a las aplicaciones corporativas.', severidad: 'ALTA' },
    recomendacion: { descripcion: 'Extender la autenticación multifactor a todas las cuentas, empezando por las que acceden a datos de clientes.', prioridad: 'ALTA', plazo_estimado: '60 días' },
  },
  '8.7': {
    evidencia: { descripcion: 'Consola del antivirus corporativo con el estado de los equipos', fuente: 'OBSERVACION_TECNICA', referencia_archivo: 'evidencias/8.7-consola-antivirus.png' },
    observacion: '23 equipos tienen las firmas del antivirus desactualizadas.',
    hallazgo: { condicion: '23 de 180 equipos llevan más de 30 días sin actualizar las firmas del antivirus.', causa: 'Son portátiles que no se conectan a la red corporativa y la consola no los alerta.', efecto_riesgo: 'Equipos expuestos a malware conocido.', severidad: 'MEDIA' },
    recomendacion: { descripcion: 'Activar la actualización por internet y una alerta para equipos sin actualizar en 7 días.', prioridad: 'MEDIA', plazo_estimado: '30 días' },
  },
  '8.8': {
    evidencia: { descripcion: 'Informe del último escaneo de vulnerabilidades y plan de parches', fuente: 'DOCUMENTAL', referencia_archivo: 'evidencias/8.8-escaneo-vulnerabilidades.pdf' },
    observacion: 'No se realizan escaneos de vulnerabilidades periódicos.',
    hallazgo: { condicion: 'No hay escaneos de vulnerabilidades programados y el último data de hace 14 meses.', causa: 'No existe un procedimiento de gestión de vulnerabilidades ni presupuesto para la herramienta.', efecto_riesgo: 'Vulnerabilidades conocidas sin corregir en sistemas expuestos a internet.', severidad: 'ALTA' },
    recomendacion: { descripcion: 'Implantar escaneos mensuales y un procedimiento de parches con plazos según la criticidad.', prioridad: 'ALTA', plazo_estimado: '90 días' },
  },
  '8.12': {
    evidencia: { descripcion: 'Reglas de prevención de fuga de datos en el correo corporativo', fuente: 'OBSERVACION_TECNICA', referencia_archivo: 'evidencias/8.12-reglas-dlp.png' },
    observacion: 'No hay controles para evitar el envío de datos sensibles fuera de la organización.',
    hallazgo: { condicion: 'No hay ninguna regla que impida enviar datos personales o financieros por correo o a memorias USB.', causa: 'La organización no ha clasificado su información ni evaluado herramientas de DLP.', efecto_riesgo: 'Fuga de datos de clientes con posibles sanciones por protección de datos.', severidad: 'ALTA' },
    recomendacion: { descripcion: 'Clasificar la información y activar reglas de DLP en el correo y en los puertos USB.', prioridad: 'ALTA', plazo_estimado: '120 días' },
  },
  '8.13': {
    evidencia: { descripcion: 'Registro de copias de seguridad diarias y acta de la última prueba de restauración', fuente: 'DOCUMENTAL', referencia_archivo: 'evidencias/8.13-prueba-restauracion.pdf' },
    observacion: 'Las copias se hacen a diario, pero nunca se ha probado una restauración completa.',
    hallazgo: { condicion: 'No consta ninguna prueba de restauración de las copias de seguridad.', causa: 'El procedimiento de copias no incluye pruebas de restauración.', efecto_riesgo: 'Las copias podrían no servir cuando se necesiten.', severidad: 'MEDIA' },
    recomendacion: { descripcion: 'Probar una restauración completa cada trimestre y documentar el tiempo que lleva.', prioridad: 'MEDIA', plazo_estimado: '60 días' },
  },
  '8.15': {
    evidencia: { descripcion: 'Configuración del registro centralizado de eventos y su política de retención', fuente: 'OBSERVACION_TECNICA', referencia_archivo: 'evidencias/8.15-siem.png' },
    observacion: 'Los registros se guardan en cada servidor y se sobrescriben a los 7 días.',
    hallazgo: { condicion: 'Los registros de eventos se guardan solo en cada servidor y se sobrescriben a los 7 días.', causa: 'No hay un sistema centralizado de registros.', efecto_riesgo: 'Imposible investigar un incidente detectado más de una semana después.', severidad: 'MEDIA' },
    recomendacion: { descripcion: 'Centralizar los registros con una retención mínima de 12 meses.', prioridad: 'MEDIA', plazo_estimado: '90 días' },
    noAplica: 'La organización no opera servidores propios: toda su infraestructura es un servicio gestionado por el proveedor.',
  },
  '8.23': {
    evidencia: { descripcion: 'Políticas del proxy de navegación y bloqueo de categorías de riesgo', fuente: 'OBSERVACION_TECNICA', referencia_archivo: 'evidencias/8.23-proxy.png' },
    observacion: 'El filtrado web solo se aplica en la sede principal, no en el teletrabajo.',
    hallazgo: { condicion: 'Los equipos en teletrabajo navegan sin ningún filtrado web.', causa: 'El proxy solo filtra el tráfico que pasa por la red de la sede.', efecto_riesgo: 'Descarga de malware desde sitios maliciosos en equipos corporativos.', severidad: 'BAJA' },
    recomendacion: { descripcion: 'Aplicar el filtrado web en el propio equipo para que funcione también fuera de la sede.', prioridad: 'BAJA', plazo_estimado: '120 días' },
  },
};

// ---------------------------------------------------------------------------
// Las auditorías de ejemplo, de la menos a la más avanzada
// ---------------------------------------------------------------------------

const I: Estado = 'IMPLEMENTADO', P: Estado = 'PARCIALMENTE_IMPLEMENTADO', N: Estado = 'NO_IMPLEMENTADO', NA: Estado = 'NO_APLICABLE';

interface Ejemplo {
  organizacion: string;
  alcance: string;
  fecha_inicio: string;
  fecha_fin: string;
  /** Estado en que queda la auditoría. */
  final: 'BORRADOR' | 'EN_EJECUCION' | 'EN_REVISION' | 'CERRADA';
  /** Controles del alcance y cómo se evalúan. */
  controles?: Record<string, Estado>;
  /** Controles del alcance que se dejan sin evaluar. */
  sinEvaluar?: string[];
  /** Huecos de trazabilidad que se dejan a propósito para practicar la revisión. */
  sinEvidencia?: string[];
  sinHallazgo?: string[];
  sinRecomendacion?: string[];
  /** Para qué sirve, se muestra al terminar. */
  para: string;
}

const EJEMPLOS: Ejemplo[] = [
  {
    organizacion: 'Cooperativa de Ahorro Los Andes', alcance: 'Controles de acceso y continuidad del negocio en la sede principal', fecha_inicio: '2026-12-01', fecha_fin: '2026-12-19',
    final: 'BORRADOR', para: 'definir el alcance (10 a 15 controles)',
  },
  {
    organizacion: 'Transportes del Valle S.A.S.', alcance: 'Seguridad de la plataforma de despacho y de las oficinas regionales', fecha_inicio: '2026-11-03', fecha_fin: '2026-11-28',
    final: 'EN_EJECUCION', para: 'evaluar controles pendientes y registrar evidencias y hallazgos',
    controles: { '5.1': I, '5.15': P, '5.18': I, '6.3': P, '7.2': I, '8.5': N, '8.7': I, '8.8': N, '8.13': I, '8.15': I, '8.23': P },
    sinEvaluar: ['8.8', '8.13', '8.15', '8.23'],
  },
  {
    organizacion: 'Clínica San Martín', alcance: 'Protección de la historia clínica electrónica y de los sistemas de admisión', fecha_inicio: '2026-10-13', fecha_fin: '2026-11-14',
    final: 'EN_REVISION', para: 'resolver las anomalías de trazabilidad y cerrar',
    controles: { '5.1': I, '5.15': I, '5.18': P, '5.24': I, '6.3': P, '7.2': I, '7.4': P, '8.5': N, '8.7': I, '8.8': N, '8.12': N, '8.13': P, '8.15': I },
    sinEvidencia: ['5.24'], sinHallazgo: ['8.8'], sinRecomendacion: ['8.13'],
  },
  {
    organizacion: 'Fondo de Empleados Horizonte', alcance: 'Evaluación del SGSI según ISO/IEC 27002:2022 previa a la certificación', fecha_inicio: '2026-10-20', fecha_fin: '2026-11-21',
    final: 'EN_REVISION', para: 'cerrar manteniendo pulsado el botón (no le falta nada)',
    controles: { '5.1': I, '5.15': I, '5.18': I, '5.24': P, '6.3': I, '7.2': I, '8.5': I, '8.7': P, '8.13': I, '8.23': I },
  },
  {
    organizacion: 'Empresa de Servicios Públicos del Norte', alcance: 'Seguridad de los sistemas comerciales y de facturación', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30',
    final: 'CERRADA', para: 'ver el acta sellada, la historia y el informe impreso',
    controles: { '5.1': I, '5.15': I, '5.18': I, '5.24': I, '6.3': P, '7.2': P, '7.4': P, '8.5': P, '8.7': P, '8.8': N, '8.12': N, '8.13': N, '8.15': NA },
  },
  {
    organizacion: 'Universidad Tecnológica del Sur', alcance: 'Plataforma académica, correo institucional y laboratorios de cómputo', fecha_inicio: '2026-08-04', fecha_fin: '2026-08-29',
    final: 'CERRADA', para: 'comparar con un cumplimiento alto en el listado y en el informe',
    controles: { '5.1': I, '5.15': I, '5.18': I, '5.24': I, '6.3': I, '7.2': I, '7.4': P, '8.5': I, '8.7': I, '8.8': I, '8.13': I, '8.15': NA },
  },
];

const NOMBRE_ESTADO: Record<Ejemplo['final'], string> = { BORRADOR: 'borrador', EN_EJECUCION: 'en ejecución', EN_REVISION: 'en revisión', CERRADA: 'cerrada' };

// ---------------------------------------------------------------------------
// Llamadas a la API
// ---------------------------------------------------------------------------

class ErrorApi extends Error {
  constructor(readonly status: number, mensaje: string) { super(mensaje); }
}

let token = '';
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ErrorApi(res.status, `${method} ${path} → ${res.status}: ${json?.error ?? res.statusText}`);
  return json as T;
}

interface Evaluacion { id: number; control: { codigo_iso: string } }

async function crear(e: Ejemplo, idDe: Map<string, number>): Promise<number> {
  const { id } = await api<{ id: number }>('POST', '/auditorias', { organizacion: e.organizacion, alcance: e.alcance, fecha_inicio: e.fecha_inicio, fecha_fin: e.fecha_fin });
  if (!e.controles) return id;

  const codigos = Object.keys(e.controles);
  await api('POST', `/auditorias/${id}/alcance`, { ids_controles: codigos.map(c => idDe.get(c)) });
  const { evaluaciones } = await api<{ evaluaciones: Evaluacion[] }>('GET', `/auditorias/${id}`);
  const evaluacionDe = new Map(evaluaciones.map(x => [x.control.codigo_iso, x.id]));

  for (const codigo of codigos) {
    if (e.sinEvaluar?.includes(codigo)) continue;
    const estado = e.controles[codigo]!, c = CONTENIDO[codigo]!, idEval = evaluacionDe.get(codigo)!;
    await api('PATCH', `/evaluaciones/${idEval}`,
      estado === NA ? { estado, justificacion_na: c.noAplica ?? 'El control no aplica a la operación de la organización.' }
        : estado === I ? { estado } : { estado, observaciones: c.observacion });
    // Implementado: su evidencia. Parcial: también, porque algo hay. Sin implementar o no aplicable: nada.
    if ((estado === I || estado === P) && !e.sinEvidencia?.includes(codigo)) await api('POST', `/evaluaciones/${idEval}/evidencias`, c.evidencia);
    if ((estado === P || estado === N) && !e.sinHallazgo?.includes(codigo)) {
      const h = await api<{ id: number }>('POST', `/evaluaciones/${idEval}/hallazgos`, c.hallazgo);
      if (!e.sinRecomendacion?.includes(codigo)) await api('POST', `/hallazgos/${h.id}/recomendaciones`, c.recomendacion);
    }
  }
  if (e.final === 'EN_REVISION' || e.final === 'CERRADA') await api('PATCH', `/auditorias/${id}/estado`, { estado: 'EN_REVISION' });
  if (e.final === 'CERRADA') await api('PATCH', `/auditorias/${id}/estado`, { estado: 'CERRADA' });
  return id;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') { console.error('demo:seed no se ejecuta con NODE_ENV=production.'); process.exit(1); }
  if (!AUDITOR.password) { console.error('Falta SEED_AUDITOR_PASSWORD en .env: el script entra como el auditor de desarrollo.'); process.exit(1); }

  try {
    token = (await api<{ token: string }>('POST', '/auth/login', AUDITOR)).token;
  } catch (err) {
    if (err instanceof ErrorApi) console.error(`No se pudo iniciar sesión como ${AUDITOR.email} (${err.status}). Revisa SEED_AUDITOR_EMAIL y SEED_AUDITOR_PASSWORD en .env y que SEED_DEFAULT_USERS=true.`);
    else console.error(`No se pudo conectar con ${API}. ¿Está la API en marcha? Arráncala con «npm run dev» en otra terminal.`);
    process.exit(1);
  }

  const catalogo = await api<{ id: number; codigo_iso: string }[]>('GET', '/controles');
  const idDe = new Map(catalogo.map(c => [c.codigo_iso, c.id]));
  const faltan = [...new Set(EJEMPLOS.flatMap(e => Object.keys(e.controles ?? {})))].filter(c => !idDe.has(c));
  if (faltan.length) { console.error(`El catálogo no tiene los controles ${faltan.join(', ')}. ¿Se cargó sql/init_auditsys.sql?`); process.exit(1); }

  const existentes = new Set((await api<{ organizacion: string }[]>('GET', '/auditorias')).map(a => a.organizacion));
  console.log(`Creando auditorías de ejemplo como ${AUDITOR.email}…\n`);
  let creadas = 0;
  for (const e of EJEMPLOS) {
    if (existentes.has(e.organizacion)) { console.log(`  ya existe   ${e.organizacion}`); continue; }
    try {
      const id = await crear(e, idDe);
      creadas++;
      console.log(`  n.º ${String(id).padEnd(5)}   ${e.organizacion} · ${NOMBRE_ESTADO[e.final]} · para ${e.para}`);
      console.log(`              ${FRONT}/auditorias/${id}${e.final === 'CERRADA' ? '/cierre' : ''}`);
    } catch (err) {
      console.error(`  error       ${e.organizacion}: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${creadas ? `${creadas} auditorías creadas.` : 'No se ha creado ninguna auditoría nueva.'} Entra en ${FRONT} con ${AUDITOR.email}.`);
}

await main();
