import { useEffect, useRef, type ReactNode } from 'react';
import { animate as resorte } from 'motion';
import type { EstadoEvaluacion, Evaluacion, InformeSellado, Nivel, VerificacionIntegridad } from '../../api/types';
import { NOMBRE_CHECK, NOMBRE_EVALUACION, NOMBRE_FUENTE, NOMBRE_NIVEL, fecha, hora, pct, plural } from '../../lib/format';
import { CountUp } from '../../motion/CountUp';
import { prefersReducedMotion } from '../../motion/motion';

/** Una pieza del informe que no se parte entre hojas: un párrafo con su título, una fila, un hallazgo. */
export interface Bloque {
  clave: string;
  clase: string;
  nodo: ReactNode;
  /** No se separa del bloque siguiente. */
  pegado?: boolean;
  /** Cabecera de tabla: se repite si la tabla continúa en otra hoja. */
  cabecera?: boolean;
  fila?: boolean;
}
export type IdSeccion = 'portada' | 'resultado' | 'hallazgos' | 'bitacora';
export interface Seccion {
  id: IdSeccion;
  /** Nombre corto, para el carril de páginas. */
  nombre: string;
  /** Si se puede dejar fuera de la impresión, el texto de su casilla. */
  opcion?: string;
  bloques: Bloque[];
}

const GRADO: Record<Nivel, number> = { BAJA: 1, MEDIA: 2, ALTA: 3 };
const Marca = ({ v }: { v: EstadoEvaluacion }) => <span className="marca" data-v={v} />;
const Severidad = ({ nivel }: { nivel: Nivel }) => (
  <span className="a4-sev"><i aria-hidden="true">{[1, 2, 3].map(k => <s key={k} className={k <= GRADO[nivel] ? 'on' : ''} />)}</i>Severidad {NOMBRE_NIVEL[nivel].toLowerCase()}</span>
);
/** La traza de un control, ya completa: evidencia, hallazgo y recomendación. */
function Traza({ e }: { e: Evaluacion }) {
  const ev = e.evidencias.length > 0, hz = e.hallazgos.length > 0, rc = e.hallazgos.some(h => h.recomendaciones.length > 0);
  return <span className="a4-tz" aria-hidden="true"><span className={ev ? 'n' : hz ? 'v' : ''} /><span className={hz ? 'n' : ''} /><span className={rc ? 'n' : ''} /><b /></span>;
}

/** Frase que resume la verificación, con lo que devuelve la API. */
export function fraseVerificacion(v: VerificacionIntegridad): string {
  const c = v.cadena;
  if (v.integra) return `Cadena íntegra: ${c.eslabones_verificados} de ${c.total_eslabones} eslabones verificados a las ${hora(c.verificado_en)}`;
  if (c.ruptura) return `Cadena alterada: ruptura en el eslabón ${c.ruptura.posicion} de ${c.total_eslabones} (${c.ruptura.motivo})`;
  return 'Informe no íntegro: no supera las comprobaciones de la verificación';
}
/** La huella que lleva cada hoja al pie, para poder cotejar una hoja suelta. */
export function huellaDe(informe: InformeSellado, v: VerificacionIntegridad): string {
  const h = informe.hash_integridad;
  if (v.integra) return `Íntegro · ${v.algoritmo} · ${h.slice(0, 16)}…${h.slice(-8)}`;
  return v.cadena.ruptura ? `No íntegro · ruptura en el eslabón ${v.cadena.ruptura.posicion} de ${v.cadena.total_eslabones}` : 'No íntegro';
}

/**
 * El contenido del informe impreso, ya troceado en bloques. Todo sale de la copia sellada al cerrar
 * (`snapshot_json`) y de la verificación de integridad; aquí no se calcula nada, solo se da formato.
 */
export function seccionesDe(informe: InformeSellado, v: VerificacionIntegridad): Seccion[] {
  const s = informe.snapshot_json, aud = s.auditoria, m = s.metricas, evals = s.evaluaciones;
  const evidencias = evals.flatMap(e => e.evidencias.map(x => ({ x, cod: e.control.codigo_iso })));
  const hallazgos = evals.flatMap(e => e.hallazgos.map(h => ({ h, e })));
  const observaciones = evals.filter(e => e.observaciones || e.justificacion_na);
  const r = v.cadena.ruptura;
  const checks: [string, boolean][] = [['La cadena es válida', v.cadena.valida], ...Object.entries(v.informe?.checks ?? {}).map(([k, ok]): [string, boolean] => [NOMBRE_CHECK[k] ?? k, ok])];

  const portada: Bloque = { clave: 'cub', clase: 'a4-cub', nodo: (
    <>
      <p className="a4-rot">Informe de auditoría de seguridad de la información</p>
      <h1 className="a4-tit">{aud.organizacion}</h1>
      <p className="a4-alc">{aud.alcance}</p>
      <dl className="a4-datos">
        <div><dt>Periodo auditado</dt><dd className="num">{fecha(aud.fecha_inicio)} – {fecha(aud.fecha_fin)}</dd></div>
        <div><dt>Auditor líder</dt><dd>{aud.auditor_nombre}</dd></div>
        <div><dt>Marco normativo</dt><dd>{s.marco_normativo.join(' · ')}</dd></div>
        <div><dt>Cierre</dt><dd className="num">{fecha(s.fecha_cierre)}, {hora(s.fecha_cierre)}</dd></div>
        <div><dt>Cerrado por</dt><dd>{s.cerrado_por.nombre} ({s.cerrado_por.rol})</dd></div>
        <div><dt>Informe</dt><dd className="num">Auditoría n.º {aud.id} · versión {informe.version}</dd></div>
      </dl>
      <div className="a4-res">
        <div>
          <p className="a4-rot">Cumplimiento</p>
          {/* Cuenta hasta el valor sellado y termina exactamente en él */}
          <p><CountUp className="a4-cifra num" valor={informe.cumplimiento_pct} desde={0} ms={1100} formato={pct} /></p>
          <p className="num">{plural(informe.total_implementados, 'control implementado', 'controles implementados')} de {plural(informe.total_aplicables, 'aplicable', 'aplicables')}</p>
          <div className="a4-unidades" aria-hidden="true">{evals.map(e => <Marca key={e.id} v={e.estado} />)}</div>
          <ul className="a4-dist num">
            <li><Marca v="IMPLEMENTADO" />Implementados<b>{m.implementados}</b></li><li>Hallazgos<b>{m.hallazgos.total}</b></li>
            <li><Marca v="PARCIALMENTE_IMPLEMENTADO" />Parciales<b>{m.parciales}</b></li><li>Severidad alta<b>{m.hallazgos.ALTA}</b></li>
            <li><Marca v="NO_IMPLEMENTADO" />No implementados<b>{m.no_implementados}</b></li><li>Severidad media<b>{m.hallazgos.MEDIA}</b></li>
            <li><Marca v="NO_APLICABLE" />No aplican<b>{m.no_aplicables}</b></li><li>Severidad baja<b>{m.hallazgos.BAJA}</b></li>
          </ul>
        </div>
        {/* El sello lo dibuja la página (crearSello), eslabón a eslabón */}
        <div className="a4-sello" data-sello="" />
      </div>
      <div className="a4-int">
        <div>
          <p className="a4-rot">Huella del informe · {v.algoritmo}</p>
          <p className="a4-hash">{informe.hash_integridad}</p>
          <p className="a4-veredicto num">{fraseVerificacion(v)}.</p>
        </div>
        <ul className="a4-checks">{checks.map(([t, ok]) => <li key={t}><span>{t}</span><b className={ok ? '' : 'no'}>{ok ? 'Sí' : 'No'}</b></li>)}</ul>
      </div>
      <div className="a4-firmas">
        <div><i /><p className="a4-lead">{s.cerrado_por.nombre}</p><p className="sub">Auditor líder</p></div>
        <div><i /><p className="a4-lead">&nbsp;</p><p className="sub">Recibido por la organización auditada</p></div>
      </div>
    </>
  ) };

  const titulo = (clave: string, h2: string, intro?: ReactNode): Bloque => ({ clave, clase: 'a4-b', pegado: true, nodo: <><h2>{h2}</h2>{intro && <p className="a4-intro">{intro}</p>}</> });
  const cab = (clave: string, tipo: string, celdas: ReactNode): Bloque => ({ clave, clase: `a4-fila a4-cabecera ${tipo}`, pegado: true, cabecera: true, nodo: celdas });

  return [
    { id: 'portada', nombre: 'Portada', bloques: [portada] },
    { id: 'resultado', nombre: 'Resultado', bloques: [
      titulo('t-res', 'Resultado por control', <><b>{plural(m.total_controles, 'control evaluado', 'controles evaluados')}.</b> Cada uno conserva su traza: la evidencia que lo respalda o, si no está implementado del todo, el hallazgo y la recomendación que le corresponden.</>),
      cab('c-res', 'a4-f-res', <><span>N.º</span><span>Control</span><span>Estado</span><span className="a4-ctr">Evid.</span><span className="a4-ctr">Hall.</span><span className="a4-ctr">Rec.</span><span>Traza</span></>),
      ...evals.map((e): Bloque => ({ clave: `res-${e.id}`, clase: 'a4-fila a4-f-res num', fila: true, nodo: (
        <>
          <span className="a4-cod">{e.control.codigo_iso}</span>
          <span>{e.control.nombre}<br /><span className="a4-tema">{e.control.categoria_tema}</span></span>
          <span className="a4-est"><Marca v={e.estado} />{NOMBRE_EVALUACION[e.estado]}</span>
          <span className="a4-ctr">{e.evidencias.length || '–'}</span><span className="a4-ctr">{e.hallazgos.length || '–'}</span>
          <span className="a4-ctr">{e.hallazgos.reduce((n, h) => n + h.recomendaciones.length, 0) || '–'}</span>
          <Traza e={e} />
        </>
      ) })),
      ...(observaciones.length ? [
        titulo('t-obs', 'Observaciones del auditor'),
        cab('c-obs', 'a4-f-obs', <><span>N.º</span><span>Observación o justificación</span></>),
        ...observaciones.map((e): Bloque => ({ clave: `obs-${e.id}`, clase: 'a4-fila a4-f-obs', fila: true, nodo: <><span className="a4-cod num">{e.control.codigo_iso}</span><span>{e.observaciones || e.justificacion_na}{!e.observaciones && e.justificacion_na ? <span className="sub"> (no aplica)</span> : null}</span></> })),
      ] : []),
      ...(evidencias.length ? [
        titulo('t-ev', 'Evidencias', <><b>{plural(evidencias.length, 'evidencia registrada', 'evidencias registradas')}.</b> La suma SHA-256 permite comprobar que el archivo referenciado es el mismo que se revisó.</>),
        cab('c-ev', 'a4-f-ev', <><span>N.º</span><span>Evidencia</span><span>Fuente</span><span>Recogida</span></>),
        ...evidencias.map(({ x, cod }): Bloque => ({ clave: `ev-${x.id}`, clase: 'a4-fila a4-f-ev', fila: true, nodo: (
          <>
            <span className="a4-cod num">{cod}</span>
            <span>{x.descripcion}{x.referencia_archivo && <span className="sub"> · {x.referencia_archivo}</span>}</span>
            <span>{NOMBRE_FUENTE[x.fuente]}</span><span className="num">{fecha(x.fecha_recoleccion)}</span>
            {x.checksum_sha256 && <span className="a4-sha">sha256 {x.checksum_sha256}</span>}
          </>
        ) })),
      ] : []),
    ] },
    { id: 'hallazgos', nombre: 'Hallazgos', opcion: 'Hallazgos en detalle', bloques: [
      titulo('t-hz', 'Hallazgos y recomendaciones', <><b>{plural(m.hallazgos.total, 'hallazgo', 'hallazgos')}: {m.hallazgos.ALTA} de severidad alta, {m.hallazgos.MEDIA} media y {m.hallazgos.BAJA} baja.</b> Cada uno se redacta con criterio, condición, causa y efecto, como pide ISO 19011.</>),
      ...hallazgos.map(({ h, e }): Bloque => ({ clave: `hz-${h.id}`, clase: 'a4-hz', nodo: (
        <>
          <div className="a4-hz-cab"><h3 className="num">Hallazgo n.º {h.id} · Control {e.control.codigo_iso} {e.control.nombre}</h3><Severidad nivel={h.severidad} /></div>
          <dl><dt>Criterio</dt><dd>{h.criterio}</dd><dt>Condición</dt><dd>{h.condicion}</dd><dt>Causa</dt><dd>{h.causa}</dd><dt>Efecto o riesgo</dt><dd>{h.efecto_riesgo}</dd></dl>
          {h.recomendaciones.map(rc => <div className="a4-rec" key={rc.id}><span className="a4-rot">Recomendación</span><span>{rc.descripcion}</span><span className="num">Prioridad {NOMBRE_NIVEL[rc.prioridad].toLowerCase()} · {rc.plazo_estimado}</span></div>)}
        </>
      ) })),
    ] },
    { id: 'bitacora', nombre: 'Bitácora', opcion: 'Bitácora completa', bloques: [
      titulo('t-bit', 'Anexo. Bitácora de la auditoría', <><b>{plural(v.eslabones.length, 'eslabón', 'eslabones')}, firmados con {v.algoritmo}.</b> Cada eslabón incluye el hash del anterior: cambiar cualquier dato posterior al registro rompe la cadena a partir de ese punto. El hash del último eslabón es la huella que figura al pie de cada hoja.</>),
      cab('c-bit', 'a4-f-bit', <><span>N.º</span><span>Fecha y hora</span><span>Evento</span><span>Hash del eslabón</span></>),
      ...v.eslabones.map((x, i): Bloque => ({ clave: `bit-${x.id}`, clase: `a4-fila a4-f-bit num${r && i + 1 > r.posicion ? ' tras' : ''}${r && i + 1 === r.posicion ? ' ruptura' : ''}`, fila: true, nodo: (
        <><span className="a4-cod">{i + 1}</span><span>{fecha(x.timestamp_utc)} {x.timestamp_utc.slice(11, 23)}</span><span className="a4-tipo">{x.tipo_evento}</span><span className="a4-h">{x.hash_actual}</span></>
      ) })),
    ] },
  ];
}

/** Un número que rueda cuando cambia (la numeración de las hojas). */
export function Rueda({ valor }: { valor: number }) {
  const el = useRef<HTMLElement>(null), previo = useRef(valor);
  useEffect(() => {
    const antes = previo.current; previo.current = valor;
    if (antes !== valor && el.current && !prefersReducedMotion()) resorte(el.current, { y: [valor > antes ? 9 : -9, 0], opacity: [0, 1] }, { duration: 0.32, ease: [0.16, 1, 0.3, 1] });
  }, [valor]);
  return <b ref={el}>{valor}</b>;
}

interface PropsHoja { portada?: boolean; titulo: string; huella: string; n: number; total: number; children: ReactNode }

/** Una hoja A4 (794 × 1123 px a 96 ppp): cabecera, cuerpo y pie con la huella del informe y el número de página. */
export function Hoja({ portada, titulo, huella, n, total, children }: PropsHoja) {
  return (
    <article className={`a4${portada ? ' a4-portada' : ''}`} aria-label={`Página ${n} de ${total}`}>
      <header className="a4-cab"><span className="a4-m">AuditA</span><span className="a4-c">{titulo}</span><span className="num">ISO/IEC 27002:2022</span></header>
      <div className="a4-cuerpo">{children}</div>
      <div className="a4-agua" aria-hidden="true">No íntegro</div>
      <footer className="a4-pie">
        <span className="a4-huella"><i aria-hidden="true" /><span className="num">{huella}</span></span>
        <span className="a4-folio num">Página <Rueda valor={n} /> de <Rueda valor={total} /></span>
      </footer>
    </article>
  );
}
