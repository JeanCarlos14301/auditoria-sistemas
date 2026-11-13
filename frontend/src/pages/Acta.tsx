import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate as animar, stagger } from 'animejs';
import { Link } from 'react-router-dom';
import { useInforme, useIntegridad } from '../api/queries';
import type { AuditoriaDetalle, Evaluacion, Informe, Nivel, VerificacionIntegridad } from '../api/types';
import { Marca, MensajeError } from '../components/basicos';
import { Cargando } from '../components/estados-pagina';
import { Postura } from '../components/Postura';
import { textoOrla } from '../components/Sello';
import { SelloRelieve } from '../components/SelloRelieve';
import { crearSello } from '../components/selloImperativo';
import { NOMBRE_CHECK, NOMBRE_EVALUACION, NOMBRE_FUENTE, NOMBRE_NIVEL, fecha, hora, pct, plural } from '../lib/format';
import { nodosDe, trazaCompleta, type Nodo } from '../lib/traza';
import { CountUp } from '../motion/CountUp';
import { cascada, moverIndicador } from '../motion/efectos';
import { gsap } from '../motion/gsap';
import { prefersReducedMotion } from '../motion/motion';

/**
 * El acta de una auditoría cerrada. Empieza por el resultado (cumplimiento sellado, veredicto de integridad,
 * imprimir el informe y el sello en relieve); después, los controles agrupados por cláusula, los hallazgos
 * del más grave al menos y la postura por atributo. Un índice en el margen dice dónde se está.
 * Todo es de solo lectura: el cumplimiento es el del informe sellado y la integridad la decide la API.
 */
export function Acta({ id, datos }: { id: number; datos: AuditoriaDetalle }) {
  const integ = useIntegridad(id, true), informe = useInforme(id, true);
  if (integ.isPending || informe.isPending) return <Cargando />;
  if (integ.isError) return <MensajeError>{integ.error.message}</MensajeError>;
  if (informe.isError) return <MensajeError>{informe.error.message}</MensajeError>;
  return <Documento id={id} datos={datos} v={integ.data} inf={informe.data.informe} verificando={integ.isFetching} reverificar={async () => { await integ.refetch(); }} />;
}

const GRADO: Record<Nivel, number> = { BAJA: 1, MEDIA: 2, ALTA: 3 };
const SECCIONES = [['ac-resultado', 'Resultado'], ['ac-controles', 'Controles'], ['ac-hallazgos', 'Hallazgos'], ['ac-postura', 'Postura']] as const;

interface DocProps { id: number; datos: AuditoriaDetalle; v: VerificacionIntegridad; inf: Informe; verificando: boolean; reverificar: () => Promise<void> }

function Documento({ id, datos, v, inf, verificando, reverificar }: DocProps) {
  const { evaluaciones, metricas: m } = datos;
  const eslabones = v.eslabones, N = eslabones.length;
  const tipos = useMemo(() => eslabones.map(e => e.tipo_evento), [eslabones]);
  const ruptura = v.integra ? null : v.cadena.ruptura?.posicion ?? null;
  const cifra = pct(Number(inf.cumplimiento_pct)), orla = textoOrla(v, inf.fecha_generacion.slice(0, 10));
  const [pulso, setPulso] = useState(0);
  const [abiertas, setAbiertas] = useState<ReadonlySet<number>>(new Set());
  const raiz = useRef<HTMLDivElement>(null), hero = useRef<HTMLElement>(null), plano = useRef<HTMLDivElement>(null), indice = useRef<HTMLOListElement>(null);

  // El sello plano: el respaldo mientras llega three.js y el que se queda sin WebGL
  useEffect(() => {
    if (!plano.current) return;
    const s = crearSello(plano.current, tipos);
    s.hasta(N); s.forma(v.hash_final, 0); s.textos(cifra, orla); s.romper(ruptura); s.sellar(true);
    return () => s.destruir();
  }, [tipos, N, v.hash_final, cifra, orla, ruptura]);

  // Entrada: el resultado llega por partes y las marcas de los controles se llenan de izquierda a derecha
  useEffect(() => {
    const el = raiz.current; if (!el || prefersReducedMotion()) return;
    cascada(el.querySelectorAll('.ac-res-txt > :not(.ac-cifra)'), 45);
    animar(el.querySelectorAll('.ac-unidades .marca'), { scaleX: [0, 1], opacity: [0, 1], duration: 500, ease: 'outExpo', delay: stagger(45, { start: 300 }) });
  }, []);
  // Las secciones entran en cascada la primera vez que asoman
  useEffect(() => {
    const el = raiz.current; if (!el) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      cascada(e.target.querySelectorAll('.ac-grupo-cab, .ac-fila, .ac-hz'), 28);
    }), { rootMargin: '0px 0px -12% 0px' });
    el.querySelectorAll('#ac-controles, #ac-hallazgos').forEach(s => io.observe(s));
    return () => io.disconnect();
  }, []);

  // Índice en el margen: la sección a la vista y cuánto se lleva leído (el JS solo escribe --p)
  const [activa, setActiva] = useState<string>('ac-resultado');
  useEffect(() => {
    const el = raiz.current; if (!el) return;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setActiva(e.target.id); }), { rootMargin: '-35% 0px -60% 0px' });
    SECCIONES.forEach(([s]) => { const x = el.querySelector(`#${s}`); if (x) io.observe(x); });
    let pide = 0;
    const leer = () => {
      pide = 0; const c = el.querySelector('.ac-contenido')!.getBoundingClientRect(), linea = innerHeight * 0.4;
      indice.current?.style.setProperty('--p', Math.max(0, Math.min(1, (linea - c.top) / Math.max(1, c.height))).toFixed(4));
    };
    const alScroll = () => { if (!pide) pide = requestAnimationFrame(leer); };
    addEventListener('scroll', alScroll, { passive: true }); leer();
    return () => { io.disconnect(); removeEventListener('scroll', alScroll); cancelAnimationFrame(pide); };
  }, []);
  const primeraVez = useRef(true);
  useLayoutEffect(() => { moverIndicador(indice.current, !primeraVez.current, 'li.activa', '.ac-ind', 'y'); primeraVez.current = false; }, [activa]);

  const alternar = (idEv: number, abrir?: boolean) => setAbiertas(s => { const x = new Set(s); if (abrir ?? !x.has(idEv)) x.add(idEv); else x.delete(idEv); return x; });
  const irAControl = (idEv: number) => {
    alternar(idEv, true);
    requestAnimationFrame(() => raiz.current?.querySelector(`[data-ev="${idEv}"]`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' }));
  };
  const verificar = async () => { await reverificar(); setPulso(x => x + 1); };

  const grupos = useMemo(() => {
    const g = new Map<string, Evaluacion[]>();
    evaluaciones.forEach(e => { const k = `${e.control.clausula} · ${e.control.categoria_tema}`; if (!g.has(k)) g.set(k, []); g.get(k)!.push(e); });
    return [...g];
  }, [evaluaciones]);
  const hallazgos = useMemo(() => evaluaciones.flatMap(e => e.hallazgos.map(h => ({ h, e })))
    .sort((a, b) => GRADO[b.h.severidad] - GRADO[a.h.severidad] || a.e.control.codigo_iso.localeCompare(b.e.control.codigo_iso, 'es', { numeric: true })), [evaluaciones]);
  const cuenta: Record<string, number | undefined> = { 'ac-controles': evaluaciones.length, 'ac-hallazgos': m.hallazgos.total };
  const c = v.cadena;
  const checks: [string, boolean][] = [['La cadena es válida', c.valida], ...Object.entries(v.informe?.checks ?? {}).map(([k, ok]): [string, boolean] => [NOMBRE_CHECK[k] ?? k, ok])];

  return (
    <div className={`ac${v.integra ? '' : ' rota'}`} ref={raiz}>
      <nav className="ac-indice" aria-label="En esta acta">
        <p className="rot">En esta acta</p>
        <ol ref={indice}>
          <span className="ac-progreso" aria-hidden="true" /><span className="ac-ind" aria-hidden="true" />
          {SECCIONES.map(([s, t]) => (
            <li key={s} className={activa === s ? 'activa' : undefined}>
              <a href={`#${s}`} onClick={e => { e.preventDefault(); document.getElementById(s)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }}>{t}<span className="num">{cuenta[s] ?? ''}</span></a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="ac-contenido">
        <section className="ac-sec" id="ac-resultado" ref={hero} aria-label="Resultado">
          <div className="ac-res">
            <div className="ac-res-txt">
              <p className="rot">Resultado del cierre · {fecha(inf.fecha_generacion)}, {hora(inf.fecha_generacion)}</p>
              {/* Cuenta hasta el cumplimiento sellado en el informe y termina exactamente en él */}
              <p className="ac-cifra"><CountUp className="num" valor={Number(inf.cumplimiento_pct)} desde={0} ms={1300} formato={pct} /></p>
              <p className="ac-res-sub"><b>{plural(inf.total_implementados, 'control implementado', 'controles implementados')} de {plural(inf.total_aplicables, 'aplicable', 'aplicables')}</b>{inf.total_no_aplicables > 0 && ` · ${plural(inf.total_no_aplicables, 'no aplica', 'no aplican')}`}</p>
              <div className="ac-unidades" aria-hidden="true">{evaluaciones.map(e => <Marca key={e.id} estado={e.estado} />)}</div>
              <div className={`ac-veredicto${verificando ? ' verificando' : ''}`} role="status">
                <p className="ac-ver-t"><i aria-hidden="true" />{verificando ? 'Verificando la cadena…' : v.integra ? 'Cadena íntegra' : c.ruptura ? `Cadena alterada: ruptura en el eslabón ${c.ruptura.posicion} de ${c.total_eslabones}` : 'Informe no íntegro'}</p>
                {!verificando && <p className="ac-ver-s num">{v.integra ? `${c.eslabones_verificados} de ${c.total_eslabones} eslabones verificados a las ${hora(c.verificado_en)} · ${v.algoritmo}` : c.ruptura ? `${c.ruptura.motivo}: se esperaba ${c.ruptura.esperado} y se encontró ${c.ruptura.encontrado}. El informe impreso saldrá marcado como copia no íntegra.` : 'La cadena es válida, pero el informe no supera todas las comprobaciones.'}</p>}
                <ul className="ac-checks">{checks.map(([t, ok]) => <li key={t} className={ok ? undefined : 'no'}>{t}{ok ? '' : ': no'}</li>)}</ul>
              </div>
              <div className="ac-acc">
                <Link className="btn imprimir" to={`/auditorias/${id}/informe`}>{v.integra ? 'Imprimir informe' : 'Imprimir como copia no íntegra'}</Link>
                <button className="btn sec" type="button" onClick={() => void verificar()} disabled={verificando}>{verificando ? 'Verificando…' : 'Verificar de nuevo'}</button>
                <Link className="enlace" to={`/auditorias/${id}/historia`}>Ver cómo se llegó a este resultado</Link>
              </div>
              <dl className="ac-dist num">
                {([['IMPLEMENTADO', 'Implementados', m.implementados], [null, 'Hallazgos', m.hallazgos.total], ['PARCIALMENTE_IMPLEMENTADO', 'Parciales', m.parciales], [null, 'Severidad alta', m.hallazgos.ALTA],
                  ['NO_IMPLEMENTADO', 'No implementados', m.no_implementados], [null, 'Severidad media', m.hallazgos.MEDIA], ['NO_APLICABLE', 'No aplican', m.no_aplicables], [null, 'Severidad baja', m.hallazgos.BAJA]] as const)
                  .map(([est, t, n]) => <div key={t}>{est && <Marca estado={est} />}<dt>{t}</dt><dd>{n}</dd></div>)}
              </dl>
            </div>
            <div className="ac-sello">
              <SelloRelieve className="ac-relieve" tipos={tipos} hashFinal={v.hash_final} cifra={cifra} orla={orla} ruptura={ruptura} pulso={pulso} encuadre={0.86} zona={hero} inclinacion={0.22} giro={-0.12}>
                <div className="ac-plano" ref={plano} />
              </SelloRelieve>
              <p className="ac-sello-pie">Sello de esta acta · {plural(N, 'eslabón', 'eslabones')} · huella <span className="hash">{v.hash_final.slice(0, 10)}…{v.hash_final.slice(-8)}</span></p>
            </div>
          </div>
        </section>

        <section className="ac-sec" id="ac-controles" aria-labelledby="ac-controles-t">
          <header className="ac-sec-cab">
            <h2 id="ac-controles-t">Controles</h2>
            <p>{plural(evaluaciones.length, 'control', 'controles')} en {plural(grupos.length, 'cláusula', 'cláusulas')}. Pulsa uno para ver su evaluación, su evidencia, sus hallazgos y sus recomendaciones.</p>
            <div className="ac-leyenda"><span><i className="l-nodo" />registrado</span><span><i className="l-na" />no aplica a su estado</span><span><i className="l-fin" />traza completa</span></div>
          </header>
          <div className="ac-tabla">
            <div className="ac-fila-g ac-t-cab" aria-hidden="true"><span>N.º</span><span>Control</span><span>Estado</span><span>Evidencia</span><span>Hallazgo</span><span>Recomendación</span><span /><span /></div>
            {grupos.map(([g, es]) => (
              <div key={g} role="group" aria-label={g}>
                <div className="ac-grupo-cab"><b>{g}</b><span className="num">{plural(es.length, 'control', 'controles')} · {es.filter(e => e.estado === 'IMPLEMENTADO').length} implementados</span></div>
                {es.map(e => <Fila key={e.id} e={e} abierta={abiertas.has(e.id)} onAlternar={() => alternar(e.id)} />)}
              </div>
            ))}
          </div>
        </section>

        <section className="ac-sec" id="ac-hallazgos" aria-labelledby="ac-hallazgos-t">
          <header className="ac-sec-cab">
            <h2 id="ac-hallazgos-t">Hallazgos y recomendaciones</h2>
            <p>{hallazgos.length ? `${plural(m.hallazgos.total, 'hallazgo', 'hallazgos')}: ${m.hallazgos.ALTA} de severidad alta, ${m.hallazgos.MEDIA} media y ${m.hallazgos.BAJA} baja. Primero los más graves, cada uno con su recomendación.` : 'Sin hallazgos.'}</p>
          </header>
          {hallazgos.length ? (
            <div className="ac-hzs">
              {hallazgos.map(({ h, e }) => (
                <article className="ac-hz" key={h.id}>
                  <div className="ac-hz-l"><Severidad nivel={h.severidad} /><span className="sub">Control {e.control.codigo_iso} · {e.control.nombre}</span><button className="enlace" type="button" onClick={() => irAControl(e.id)}>Ver el control</button></div>
                  <div className="ac-hz-r">
                    <p className="lead">{h.condicion}</p>
                    <p className="sub">{h.causa} {h.efecto_riesgo}</p>
                    {h.recomendaciones.map(r => <div className="ac-rec" key={r.id}><span className="rot">Recomendación</span><span>{r.descripcion}</span><span className="sub num">Prioridad {NOMBRE_NIVEL[r.prioridad].toLowerCase()} · {r.plazo_estimado}</span></div>)}
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="sub">Todos los controles aplicables están implementados.</p>}
        </section>

        <section className="ac-sec" id="ac-postura"><Postura evaluaciones={evaluaciones} /></section>
      </div>
    </div>
  );
}

function Severidad({ nivel }: { nivel: Nivel }) {
  return <span className="sev"><i aria-hidden="true">{[1, 2, 3].map(k => <s key={k} className={k <= GRADO[nivel] ? 'on' : undefined} />)}</i>Severidad {NOMBRE_NIVEL[nivel].toLowerCase()}</span>;
}

const NOMBRE_TRAMO = ['evidencia', 'hallazgo', 'recomendación'] as const;
/** Cómo se dibuja cada tramo: solo hay nudo donde hay algo registrado; lo que no aplica a su estado va punteado. */
const claseDe = (n: Nodo): string => (n === 'ok' ? 's-si' : n === 'no' ? 's-na' : 's-falta');

/** Una fila de control. Al pulsarla se despliega su evaluación, su evidencia, sus hallazgos y sus recomendaciones. */
function Fila({ e, abierta, onAlternar }: { e: Evaluacion; abierta: boolean; onAlternar: () => void }) {
  const nodos = nodosDe(e), completa = trazaCompleta(nodos), na = e.estado === 'NO_APLICABLE';
  const cuentas = [e.evidencias.length, e.hallazgos.length, e.hallazgos.reduce((s, h) => s + h.recomendaciones.length, 0)];
  const [montada, setMontada] = useState(abierta);
  const det = useRef<HTMLDivElement>(null), primera = useRef(true);
  useLayoutEffect(() => {
    if (primera.current) { primera.current = false; return; }
    if (abierta) { setMontada(true); return; }
    if (det.current && !prefersReducedMotion()) gsap.to(det.current, { height: 0, duration: 0.32, ease: 'power3.in', onComplete: () => setMontada(false) });
    else setMontada(false);
  }, [abierta]);
  useLayoutEffect(() => {
    if (!montada || !abierta || !det.current || prefersReducedMotion()) return;
    gsap.fromTo(det.current, { height: 0 }, { height: 'auto', duration: 0.45, ease: 'power3.out', clearProps: 'height' });
    cascada(det.current.querySelectorAll('.ac-det-b > *'), 60);
  }, [montada]);

  return (
    <div className={`ac-fila${abierta ? ' abierta' : ''}`} data-ev={e.id}>
      <button className="ac-fila-btn ac-fila-g" type="button" aria-expanded={abierta} onClick={onAlternar}>
        <span className="f-cod num">{e.control.codigo_iso}</span>
        <span className="f-nom">{e.control.nombre}</span>
        <span className="f-est"><Marca estado={e.estado} />{NOMBRE_EVALUACION[e.estado]}</span>
        <span className="ac-tzs">
          {nodos.map((n, k) => <span key={k} className={`ac-tz ${claseDe(n)}`} title={n === 'ok' ? `${cuentas[k]} ${NOMBRE_TRAMO[k]}` : n === 'no' ? `${NOMBRE_TRAMO[k]}: no aplica a su estado` : `Falta: ${NOMBRE_TRAMO[k]}`}><i />{n === 'ok' && cuentas[k]! > 1 && <em>×{cuentas[k]}</em>}</span>)}
          <b className={`ac-fin${na ? ' na' : completa ? '' : ' inc'}`} title={na ? 'No aplica: no necesita traza' : completa ? 'Traza completa' : 'Traza incompleta'} />
        </span>
        <i className="chev" aria-hidden="true" />
      </button>
      {montada && (
        <div className="ac-det-w" ref={det}>
          <div className="ac-det">
            <div className="ac-det-b">
              <div><h3>Evaluación</h3><p>{NOMBRE_EVALUACION[e.estado]}{e.observaciones ? `. ${e.observaciones}` : ''}{e.justificacion_na ? `. ${e.justificacion_na}` : ''}</p></div>
              <div><h3>Criterio</h3><p className="sub">{e.control.criterio_evaluacion}</p></div>
              <div><h3>Evidencia</h3>
                {e.evidencias.length ? e.evidencias.map(x => (
                  <div className="ac-evid" key={x.id}><p>{x.descripcion}</p><p className="sub num">{NOMBRE_FUENTE[x.fuente]} · {fecha(x.fecha_recoleccion)}{x.referencia_archivo ? ` · ${x.referencia_archivo}` : ''}</p>{x.checksum_sha256 && <p className="hash sub">sha256 {x.checksum_sha256}</p>}</div>
                )) : <p className="sub">{e.estado === 'IMPLEMENTADO' ? 'Sin evidencia registrada.' : 'No se registró evidencia: no la exige su estado.'}</p>}
              </div>
            </div>
            <div className="ac-det-b">
              <div><h3>Hallazgos y recomendaciones</h3>
                {e.hallazgos.length ? e.hallazgos.map(h => (
                  <div className="ac-det-hz" key={h.id}>
                    <Severidad nivel={h.severidad} />
                    <dl><dt>Condición</dt><dd>{h.condicion}</dd><dt>Causa</dt><dd>{h.causa}</dd><dt>Efecto</dt><dd>{h.efecto_riesgo}</dd></dl>
                    {h.recomendaciones.map(r => <div className="ac-rec" key={r.id}><span className="rot">Recomendación</span><span>{r.descripcion}</span><span className="sub num">Prioridad {NOMBRE_NIVEL[r.prioridad].toLowerCase()} · {r.plazo_estimado}</span></div>)}
                  </div>
                )) : <p className="sub">{na ? 'No aplica a esta organización.' : 'Sin hallazgos: el control está implementado.'}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
