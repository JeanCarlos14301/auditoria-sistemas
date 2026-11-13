import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuditoria, useCambiarEstado, useEvaluar } from '../api/queries';
import type { AuditoriaDetalle, EstadoEvaluacion, Evaluacion, Hallazgo, ResumenMetricas } from '../api/types';
import { Marca, MensajeError } from '../components/basicos';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { FormEvidencia, FormHallazgo, FormRecomendacion } from '../components/Formularios';
import { Postura } from '../components/Postura';
import { ESTADOS_EVALUACION, MIN_TEXTO_EVALUACION, MSG_CP04, MSG_CP05, NOMBRE_ESTADO, NOMBRE_EVALUACION, NOMBRE_FUENTE, NOMBRE_NIVEL, fecha, hora, pct, plural } from '../lib/format';
import { nodosDe, sinEvaluar, type Nodo } from '../lib/traza';
import { CountUp } from '../motion/CountUp';
import { brincar, cascada, moverIndicador, sacudir } from '../motion/efectos';
import { CURVA, Flip, gsap } from '../motion/gsap';
import { prefersReducedMotion } from '../motion/motion';
import { Alcance } from './Alcance';

export default function Trabajo() {
  const id = Number(useParams().id);
  const q = useAuditoria(id);
  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  const { estado } = q.data.auditoria;
  // Una auditoría cerrada es de solo lectura: su vista es el acta con el sello.
  if (estado === 'CERRADA') return <Navigate to={`/auditorias/${id}/cierre`} replace />;
  // En Borrador todavía no hay nada que evaluar: la hoja se abre en su alcance.
  if (estado === 'BORRADOR') return <Alcance id={id} />;
  return <Vista id={id} datos={q.data} />;
}

type Filtro = 'todos' | 'pend';
const grupoDe = (e: Evaluacion) => `${e.control.clausula} · ${e.control.categoria_tema}`;
const marcaDe = (e: Evaluacion) => (sinEvaluar(e) ? 'PEND' : e.estado);
/** Lo que se lee de un control en el índice: su estado y lo que tiene registrado. */
const resumen = (e: Evaluacion) => sinEvaluar(e) ? 'Por evaluar'
  : [NOMBRE_EVALUACION[e.estado], e.evidencias.length ? plural(e.evidencias.length, 'evidencia', 'evidencias') : '', e.hallazgos.length ? plural(e.hallazgos.length, 'hallazgo', 'hallazgos') : ''].filter(Boolean).join(' · ');

/**
 * La evaluación de una auditoría en curso, a todo el ancho del marco: a la izquierda el índice de controles con sus
 * nombres completos, agrupados por cláusula; en el centro el control elegido; a la derecha las métricas, fijas.
 * En el móvil, una barra fija (anterior, este, siguiente) abre el índice a pantalla completa.
 */
function Vista({ id, datos }: { id: number; datos: AuditoriaDetalle }) {
  const { auditoria, evaluaciones, metricas } = datos;
  const ir = useNavigate();
  const [sel, setSel] = useState<number>(() => (evaluaciones.find(sinEvaluar) ?? evaluaciones[0])!.id);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState(false);
  const actual = evaluaciones.find(e => e.id === sel) ?? evaluaciones[0]!;
  const i = evaluaciones.indexOf(actual);
  const pendientes = evaluaciones.filter(sinEvaluar);
  const cambiar = useCambiarEstado(id);
  const destino = auditoria.estado === 'EN_EJECUCION' ? 'EN_REVISION' : 'EN_EJECUCION';

  const indice = useRef<HTMLElement>(null), cont = useRef<HTMLDivElement>(null), gFiltro = useRef<HTMLDivElement>(null), det = useRef<HTMLElement>(null);
  const antes = useRef<Flip.FlipState | null>(null), saliendo = useRef<{ id: number; dir: number } | null>(null), dir = useRef(0), primera = useRef(true), selActual = useRef(sel);
  selActual.current = sel;

  // El índice: con «Por evaluar» quedan los pendientes y el control abierto
  const grupos = useMemo(() => {
    const g = new Map<string, Evaluacion[]>();
    evaluaciones.forEach(e => { const k = grupoDe(e); if (!g.has(k)) g.set(k, []); if (filtro === 'todos' || sinEvaluar(e) || e.id === sel) g.get(k)!.push(e); });
    return [...g].filter(([, es]) => es.length > 0);
  }, [evaluaciones, filtro, sel]);
  /** El siguiente por evaluar después del abierto (y si no, desde el principio). */
  const siguiente = [...evaluaciones.slice(i + 1), ...evaluaciones.slice(0, i)].find(sinEvaluar);

  /** Cambia de control: el que se va sale hacia arriba (o abajo) y el nuevo entra por partes. */
  const seleccionar = useCallback((nuevo: number) => {
    setAbierto(false);
    const ia = evaluaciones.findIndex(e => e.id === sel), ib = evaluaciones.findIndex(e => e.id === nuevo), d = ib >= ia ? 1 : -1;
    const el = det.current;
    // Si el principio del control quedó arriba, fuera de la vista, se vuelve a él
    if (el) { const top = el.getBoundingClientRect().top - (innerWidth <= 860 ? 124 : 80); if (top < 0) scrollTo({ top: scrollY + top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }
    if (nuevo === sel && !saliendo.current) return;
    if (prefersReducedMotion() || !el) { dir.current = 0; setSel(nuevo); return; }
    if (saliendo.current) { saliendo.current = { id: nuevo, dir: d }; return; }
    saliendo.current = { id: nuevo, dir: d };
    gsap.to(el.children, { opacity: 0, y: -10 * d, duration: 0.16, stagger: 0.02, ease: 'power2.in', onComplete: () => { const s = saliendo.current!; saliendo.current = null; if (s.id === selActual.current) { gsap.set(el.children, { clearProps: 'all' }); return; } dir.current = s.dir; setSel(s.id); } });
  }, [evaluaciones, sel]);

  // El control nuevo entra por partes, en la dirección del cambio
  useLayoutEffect(() => {
    if (primera.current || !det.current) return;
    cascada(det.current.children, 40, dir.current ? 14 * dir.current : 14);
  }, [sel]);

  // La barra del índice se desliza hasta el control abierto (resorte); el filtro recoloca las filas (Flip)
  useLayoutEffect(() => {
    moverIndicador(cont.current, !primera.current, '.ti[aria-current="true"]', '.ti-bar', 'y');
    moverIndicador(gFiltro.current, !primera.current);
    const fila = cont.current?.querySelector<HTMLElement>('.ti[aria-current="true"]'), caja = indice.current;
    if (fila && caja && getComputedStyle(caja).display !== 'none') {
      const r = fila.getBoundingClientRect(), c = caja.getBoundingClientRect();
      if (r.top < c.top + 48 || r.bottom > c.bottom) fila.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    const estado = antes.current; antes.current = null;
    if (!estado || !cont.current) return;
    const ctx = gsap.context(() => {
      Flip.from(estado, { targets: cont.current!.querySelectorAll('.ti, .ti-g-cab'), duration: 0.5, ease: CURVA.cambio, absoluteOnLeave: true,
        onLeave: els => gsap.to(els, { opacity: 0, x: -20, duration: 0.3 }), onEnter: els => gsap.fromTo(els, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, clearProps: 'all' }),
        onComplete: () => moverIndicador(cont.current, false, '.ti[aria-current="true"]', '.ti-bar', 'y') });
    });
    return () => ctx.revert();
  }, [sel, filtro, evaluaciones]);

  const filtrar = (f: Filtro) => { if (f === filtro) return; if (cont.current && !prefersReducedMotion()) antes.current = Flip.getState(cont.current.querySelectorAll('.ti, .ti-g-cab')); setFiltro(f); };

  // Al entrar: el índice, el control y las métricas en cascada
  useEffect(() => {
    primera.current = false;
    const ro = new ResizeObserver(() => { moverIndicador(cont.current, false, '.ti[aria-current="true"]', '.ti-bar', 'y'); moverIndicador(gFiltro.current, false); });
    if (cont.current) ro.observe(cont.current);
    const raiz = det.current?.closest('.tr');
    if (raiz && !prefersReducedMotion()) {
      cascada(raiz.querySelectorAll('.seccion-cab, .tr-nav, .ti-cab'), 60);
      cascada(raiz.querySelectorAll('.ti-g-cab, .ti'), 28, 10);
      cascada(det.current!.children, 60);
      cascada(raiz.querySelectorAll('.tr-met > *'), 70);
    }
    return () => ro.disconnect();
  }, []);

  // El índice a pantalla completa (móvil): Escape lo cierra y la página de debajo no se desplaza
  useEffect(() => {
    if (!abierto) return;
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAbierto(false); };
    addEventListener('keydown', esc); document.body.style.overflow = 'hidden';
    moverIndicador(cont.current, false, '.ti[aria-current="true"]', '.ti-bar', 'y'); moverIndicador(gFiltro.current, false);
    cont.current?.querySelector('.ti[aria-current="true"]')?.scrollIntoView({ block: 'center' });
    indice.current?.querySelector<HTMLElement>('.ti-cerrar')?.focus();
    if (!prefersReducedMotion() && indice.current) gsap.fromTo(indice.current, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.35, ease: CURVA.entrada, clearProps: 'all' });
    return () => { removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [abierto]);

  /** Al guardar una evaluación, su marca brinca en el índice y en las métricas. */
  const guardado = useCallback((idEv: number) => {
    requestAnimationFrame(() => { brincar(cont.current?.querySelector(`.ti[data-id="${idEv}"] .marca`) ?? null, 0.2); brincar(document.querySelector(`.um[data-id="${idEv}"]`), 0.4); });
  }, []);

  const pasar = () => cambiar.mutate(destino, { onSuccess: () => { if (destino === 'EN_REVISION') ir(`/auditorias/${id}/cierre`); } });
  const np = pendientes.length;

  return (
    <section className="tr" aria-label="Evaluación de controles">
      <header className="seccion-cab">
        <div>
          <h2>Evaluación de controles</h2>
          <p>{np ? `Elige un control, marca su estado y registra lo que lo respalda. ${np === 1 ? 'Queda 1 control' : `Quedan ${np} controles`} por evaluar.` : 'Todos los controles están evaluados. Completa las trazas que falten y pasa a revisión.'}</p>
        </div>
        <div className="tr-acc">
          <button className="btn sec" type="button" disabled={cambiar.isPending} onClick={pasar}>{destino === 'EN_REVISION' ? 'Pasar a revisión' : 'Volver a ejecución'}</button>
          {cambiar.isError ? <MensajeError>{cambiar.error.message}</MensajeError>
            : cambiar.isSuccess && destino === 'EN_EJECUCION' && <p className="aviso entra" role="status">Estado actualizado: {NOMBRE_ESTADO[cambiar.data.auditoria.estado]}.</p>}
        </div>
      </header>

      <div className="tr-cuerpo">
        <div className="tr-nav">
          <button className="tn-btn" type="button" aria-label="Control anterior" disabled={i === 0} onClick={() => seleccionar(evaluaciones[i - 1]!.id)}>‹</button>
          <button className="tn-act" type="button" aria-haspopup="true" aria-expanded={abierto} onClick={() => setAbierto(true)}>
            <Marca estado={marcaDe(actual)} /><b>{actual.control.codigo_iso} · {actual.control.nombre}</b><small className="num">{i + 1} de {evaluaciones.length} · {resumen(actual)}</small>
          </button>
          <button className="tn-btn" type="button" aria-label="Control siguiente" disabled={i === evaluaciones.length - 1} onClick={() => seleccionar(evaluaciones[i + 1]!.id)}>›</button>
        </div>

        <nav className={`tr-ind${abierto ? ' abierto' : ''}`} ref={indice} aria-label="Controles del alcance">
          <div className="ti-cab">
            <div className="chips" ref={gFiltro} role="group" aria-label="Mostrar">
              <span className="chip-ind" aria-hidden="true" />
              <button className="chip" type="button" aria-pressed={filtro === 'todos'} onClick={() => filtrar('todos')}>Todos <span className="num">{evaluaciones.length}</span></button>
              <button className="chip" type="button" aria-pressed={filtro === 'pend'} onClick={() => filtrar('pend')}>Por evaluar <span className="num">{np}</span></button>
            </div>
            <button className="btn sec min ti-cerrar" type="button" onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
          <div className="ti-cont" ref={cont}>
            <span className="ti-bar" aria-hidden="true" />
            {grupos.map(([g, es]) => {
              const todos = evaluaciones.filter(e => grupoDe(e) === g);
              return (
                <Fragment key={g}>
                  <div className="ti-g-cab" data-flip-id={`g${g}`}><b>{g}</b><span className="num">{todos.filter(e => !sinEvaluar(e)).length} de {todos.length} evaluados</span></div>
                  {es.map(e => (
                    <button key={e.id} type="button" className={`ti${sinEvaluar(e) ? ' pend' : ''}`} data-id={e.id} data-flip-id={`t${e.id}`} aria-current={e.id === actual.id}
                      onClick={() => seleccionar(e.id)}
                      onKeyDown={ev => {
                        // Flechas arriba y abajo para recorrer el índice
                        if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
                        ev.preventDefault();
                        const bs = Array.from(cont.current?.querySelectorAll<HTMLButtonElement>('.ti') ?? []), j = bs.indexOf(ev.currentTarget) + (ev.key === 'ArrowDown' ? 1 : -1);
                        if (bs[j]) { bs[j].focus(); seleccionar(Number(bs[j].dataset.id)); }
                      }}>
                      <Marca estado={marcaDe(e)} /><span className="cod num">{e.control.codigo_iso}</span><span className="nom">{e.control.nombre}</span><span className="est">{resumen(e)}</span>
                    </button>
                  ))}
                </Fragment>
              );
            })}
          </div>
        </nav>

        <article className="tr-det" ref={det} aria-label={`Control ${actual.control.codigo_iso}`}>
          {/* key: al cambiar de control el detalle se monta de nuevo, con sus formularios en blanco */}
          <Detalle key={actual.id} idAuditoria={id} ev={actual} siguiente={siguiente} ultimoPendiente={sinEvaluar(actual) && np === 1} onIr={seleccionar} onGuardado={guardado} />
        </article>

        <Metricas m={metricas} evaluaciones={evaluaciones} actual={actual.id} onIr={seleccionar} />
      </div>

      <div className="tr-post" id="postura"><Postura evaluaciones={evaluaciones} /></div>
    </section>
  );
}

function Metricas({ m, evaluaciones, actual, onIr }: { m: ResumenMetricas; evaluaciones: Evaluacion[]; actual: number; onIr: (id: number) => void }) {
  const evaluados = evaluaciones.filter(e => !sinEvaluar(e)).length;
  return (
    <aside className="tr-met" aria-label="Métricas">
      <div className="tm-a">
        <p className="rot">Cumplimiento</p>
        {/* El valor es el de la API; la cuenta solo anima el paso del anterior al nuevo y termina exactamente en él */}
        <p className="tm-cifra num"><CountUp valor={m.cumplimiento_pct} desde={0} ms={900} formato={pct} /></p>
        <p className="tm-sub num">{m.implementados} implementados de {m.total_aplicables} aplicables</p>
      </div>
      <div className="tm-b">
        <div className="tm-unid" role="group" aria-label="Ir a un control">
          {evaluaciones.map(e => (
            <button key={e.id} className="um" type="button" data-id={e.id} aria-current={e.id === actual} aria-label={`${e.control.codigo_iso}: ${sinEvaluar(e) ? 'por evaluar' : NOMBRE_EVALUACION[e.estado].toLowerCase()}`} title={`${e.control.codigo_iso} ${e.control.nombre}`} onClick={() => onIr(e.id)}>
              <Marca estado={marcaDe(e)} />
            </button>
          ))}
        </div>
        <div>
          <p className="tm-ev num">{evaluados} de {evaluaciones.length} evaluados</p>
          <div className="tm-barra" aria-hidden="true">{evaluaciones.map(e => <i key={e.id} className={sinEvaluar(e) ? undefined : 'on'} />)}</div>
        </div>
      </div>
      <div className="tm-c">
        <dl className="cuentas">
          <dt>Implementados</dt><dd>{m.implementados}</dd>
          <dt>Parciales</dt><dd>{m.parciales}</dd>
          <dt>No implementados</dt><dd>{m.no_implementados}</dd>
          <dt>No aplican</dt><dd>{m.no_aplicables}</dd>
        </dl>
        <dl className="cuentas">
          <dt>Hallazgos</dt><dd>{m.hallazgos.total}</dd>
          <dt>Severidad alta</dt><dd>{m.hallazgos.ALTA}</dd>
          <dt>Severidad media</dt><dd>{m.hallazgos.MEDIA}</dd>
          <dt>Severidad baja</dt><dd>{m.hallazgos.BAJA}</dd>
        </dl>
      </div>
      <a className="enlace tm-post" href="#postura">Postura por atributo</a>
    </aside>
  );
}

/** Los registros que aparecen después de montar el control se marcan un momento como nuevos. */
function useNuevos(ids: readonly number[]): ReadonlySet<number> {
  const previos = useRef<ReadonlySet<number> | null>(null);
  const [nuevos, setNuevos] = useState<ReadonlySet<number>>(new Set());
  const clave = ids.join(',');
  useEffect(() => {
    const lista = clave ? clave.split(',').map(Number) : [];
    const ahora = new Set(lista), llegados = previos.current ? lista.filter(x => !previos.current!.has(x)) : [];
    previos.current = ahora;
    if (!llegados.length) return;
    setNuevos(s => new Set([...s, ...llegados]));
    setTimeout(() => setNuevos(s => { const x = new Set(s); llegados.forEach(n => x.delete(n)); return x; }), 1700);
  }, [clave]);
  return nuevos;
}

const TRAMOS = ['Evidencia', 'Hallazgo', 'Recomendación'] as const;
const CLASE_NODO: Record<Nodo, string> = { ok: 's-si', no: 's-na', falta: 's-falta', pend: 's-falta' };
/** Qué dice cada tramo de la traza para el estado elegido. */
function textoTramo(k: number, n: Nodo, ev: Evaluacion): string {
  const nEv = ev.evidencias.length, nHz = ev.hallazgos.length, sinRec = ev.hallazgos.filter(h => !h.recomendaciones.length).length;
  if (k === 0) return n === 'falta' ? 'Falta: un control implementado necesita evidencia' : nEv ? plural(nEv, 'registrada', 'registradas') : 'No la exige este estado';
  if (k === 1) return n === 'falta' ? 'Falta: un control parcial o no implementado necesita un hallazgo' : n === 'ok' ? plural(nHz, 'registrado', 'registrados') : 'No lo exige este estado';
  if (n === 'pend') return 'Falta, después del hallazgo';
  if (n === 'falta') return `Falta en ${plural(sinRec, 'hallazgo', 'hallazgos')}`;
  return n === 'ok' ? (nHz > 1 ? 'Cada hallazgo tiene la suya' : 'Registrada') : 'No la exige este estado';
}

type Abierto = 'evidencia' | 'hallazgo' | { recomendacionDe: number } | null;

/** El control abierto: qué es, su estado, lo que ese estado exige para poder cerrar y lo que lo respalda. */
function Detalle({ idAuditoria, ev, siguiente, ultimoPendiente, onIr, onGuardado }: { idAuditoria: number; ev: Evaluacion; siguiente?: Evaluacion; ultimoPendiente: boolean; onIr: (id: number) => void; onGuardado: (id: number) => void }) {
  const c = ev.control;
  const [estado, setEstado] = useState<EstadoEvaluacion | null>(sinEvaluar(ev) ? null : ev.estado);
  const [abierto, setAbierto] = useState<Abierto>(null);
  const traza = useRef<HTMLDivElement>(null), primeraTraza = useRef(true);
  const cerrar = useCallback(() => setAbierto(null), []);
  const nodos = nodosDe({ ...ev, estado: estado ?? 'NO_IMPLEMENTADO' });
  const nuevosEv = useNuevos(ev.evidencias.map(v => v.id)), nuevosHz = useNuevos(ev.hallazgos.map(h => h.id)), nuevasRec = useNuevos(ev.hallazgos.flatMap(h => h.recomendaciones.map(r => r.id)));
  const nudo = (k: number) => () => traza.current?.querySelector(`.tt[data-k="${k}"] i`) ?? null;

  // Al cambiar el estado elegido o completarse un tramo, los nudos de la traza laten
  const firma = nodos.join();
  useEffect(() => {
    if (primeraTraza.current) { primeraTraza.current = false; return; }
    const ns = traza.current?.querySelectorAll('.tt i');
    if (ns && !prefersReducedMotion()) ns.forEach((n, k) => brincar(n, k ? 0.3 : 0.2));
  }, [firma]);

  /** Después de guardar: si a este control aún le falta algo, el botón que lo resuelve brinca. */
  const alGuardar = () => {
    onGuardado(ev.id);
    const k = nodos.findIndex(n => n === 'falta');
    if (k === 0 || k === 1) setTimeout(() => brincar(traza.current?.closest('.tr-det')?.querySelector(`[data-abrir="${k === 0 ? 'evidencia' : 'hallazgo'}"]`) ?? null, 0.85), 350);
  };

  const tituloTraza = !estado ? 'Elige un estado para ver lo que exige' : estado === ev.estado && !sinEvaluar(ev) ? 'Con su estado, para poder cerrar' : `Si queda como «${NOMBRE_EVALUACION[estado]}», para poder cerrar`;
  return (
    <>
      <header className="td-cab">
        <p className="rot num">Control {c.codigo_iso} · Cláusula {c.clausula} · {c.categoria_tema}</p>
        <h2>{c.nombre}</h2>
        <p className="td-attr"><span>Tipo <b>{c.attr_tipo_control}</b></span><span>Propiedades <b>{c.attr_propiedades_cia}</b></span><span>NIST <b>{c.attr_concepto_nist}</b></span><span>Dominio <b>{c.attr_dominio_seguridad}</b></span></p>
      </header>
      <section className="td-crit">
        <div><h3 className="rot">Criterio de evaluación</h3><p className="crit">{c.criterio_evaluacion}</p></div>
        <div><h3 className="rot">Evidencia que suele respaldarlo</h3><p className="ej">{c.ejemplo_evidencia}</p></div>
      </section>

      <FormEvaluacion idAuditoria={idAuditoria} ev={ev} estado={estado} onEstado={setEstado} siguiente={siguiente} ultimoPendiente={ultimoPendiente} onIr={onIr} onGuardado={alGuardar} />

      <section className="td-traza-w" aria-labelledby={`tt-${ev.id}`}>
        <h3 className="rot" id={`tt-${ev.id}`}>{tituloTraza}</h3>
        <div className={`td-traza${estado ? '' : ' tenue'}`} ref={traza}>
          {nodos.map((n, k) => <div key={k} className={`tt ${CLASE_NODO[n]}`} data-k={k}><i aria-hidden="true" /><b>{TRAMOS[k]}</b><span>{textoTramo(k, n, ev)}</span></div>)}
        </div>
      </section>

      <section className="td-sec">
        <div className="td-sec-cab"><h3>Evidencias<span className="num">{ev.evidencias.length}</span></h3>{abierto !== 'evidencia' && <button className="btn sec min" type="button" data-abrir="evidencia" onClick={() => setAbierto('evidencia')}>Registrar evidencia</button>}</div>
        {abierto === 'evidencia' && <FormEvidencia idAuditoria={idAuditoria} idEvaluacion={ev.id} destino={nudo(0)} onHecho={cerrar} onCancelar={cerrar} />}
        {ev.evidencias.length ? (
          <ul className="reg">{ev.evidencias.map(v => (
            <li key={v.id} className={`evd${nuevosEv.has(v.id) ? ' fresco' : ''}`}>
              <span>{v.descripcion}</span>
              <span className="meta num">{NOMBRE_FUENTE[v.fuente]} · {fecha(v.fecha_recoleccion)} · {v.referencia_archivo ?? 'sin archivo'}</span>
              {v.checksum_sha256 && <span className="hash">sha256 {v.checksum_sha256}</span>}
            </li>
          ))}</ul>
        ) : <p className="vacio">Sin evidencias registradas.</p>}
      </section>

      <section className="td-sec">
        <div className="td-sec-cab"><h3>Hallazgos<span className="num">{ev.hallazgos.length}</span></h3>{abierto !== 'hallazgo' && <button className="btn sec min" type="button" data-abrir="hallazgo" onClick={() => setAbierto('hallazgo')}>Registrar hallazgo</button>}</div>
        {abierto === 'hallazgo' && <FormHallazgo idAuditoria={idAuditoria} idEvaluacion={ev.id} criterio={c.criterio_evaluacion} destino={nudo(1)} onHecho={cerrar} onCancelar={cerrar} />}
        {ev.hallazgos.length ? (
          <ul className="reg">{ev.hallazgos.map(h => (
            <FichaHallazgo key={h.id} h={h} nuevo={nuevosHz.has(h.id)} nuevas={nuevasRec}
              abierto={typeof abierto === 'object' && abierto?.recomendacionDe === h.id} onAbrir={() => setAbierto({ recomendacionDe: h.id })}
              form={<FormRecomendacion idAuditoria={idAuditoria} idHallazgo={h.id} destino={nudo(2)} onHecho={cerrar} onCancelar={cerrar} />} />
          ))}</ul>
        ) : <p className="vacio">Sin hallazgos registrados.</p>}
      </section>
    </>
  );
}

function FichaHallazgo({ h, nuevo, nuevas, abierto, onAbrir, form }: { h: Hallazgo; nuevo: boolean; nuevas: ReadonlySet<number>; abierto: boolean; onAbrir: () => void; form: React.ReactNode }) {
  return (
    <li className={`hz${nuevo ? ' fresco' : ''}`} data-sev={h.severidad}>
      <p><span className="hz-sev">Severidad {NOMBRE_NIVEL[h.severidad].toLowerCase()}</span></p>
      <p className="hz-cond">{h.condicion}</p>
      <dl><dt>Causa</dt><dd>{h.causa}</dd><dt>Efecto o riesgo</dt><dd>{h.efecto_riesgo}</dd></dl>
      {h.recomendaciones.length > 0 && (
        <div className="recs">{h.recomendaciones.map(r => (
          <div key={r.id} className={`rec${nuevas.has(r.id) ? ' fresco' : ''}`}><span>{r.descripcion}</span><span className="meta">Prioridad {NOMBRE_NIVEL[r.prioridad].toLowerCase()} · plazo {r.plazo_estimado}</span></div>
        ))}</div>
      )}
      {abierto ? form : (
        <div className="hz-acc">
          {h.recomendaciones.length === 0 && <span className="falta">Sin recomendación: el cierre quedará bloqueado.</span>}
          <button className="btn sec min" type="button" onClick={onAbrir}>Registrar recomendación</button>
        </div>
      )}
    </li>
  );
}

function FormEvaluacion({ idAuditoria, ev, estado, onEstado, siguiente, ultimoPendiente, onIr, onGuardado }: {
  idAuditoria: number; ev: Evaluacion; estado: EstadoEvaluacion | null; onEstado: (e: EstadoEvaluacion) => void;
  siguiente?: Evaluacion; ultimoPendiente: boolean; onIr: (id: number) => void; onGuardado: () => void;
}) {
  const m = useEvaluar(idAuditoria);
  const [obs, setObs] = useState(ev.observaciones ?? '');
  const [na, setNa] = useState(ev.justificacion_na ?? '');
  const [local, setLocal] = useState<{ campo: 'obs' | 'na' | 'estado'; msg: string } | null>(null);
  const [eraUltimo, setEraUltimo] = useState(false);
  const form = useRef<HTMLFormElement>(null), aviso = useRef<HTMLDivElement>(null);
  useEffect(() => { if (local || m.isError) sacudir(local?.campo === 'estado' ? form.current?.querySelector('.seg') ?? null : form.current); }, [local, m.isError]);
  // Sin evaluar, el selector arranca sin marcar sobre «No implementado», el estado inicial que guarda la API
  const i = ESTADOS_EVALUACION.indexOf(estado ?? 'NO_IMPLEMENTADO');
  const pideObs = estado === 'PARCIALMENTE_IMPLEMENTADO' || estado === 'NO_IMPLEMENTADO';
  const pideNa = estado === 'NO_APLICABLE';
  const error = local?.msg ?? (m.isError ? m.error.message : null);
  const errObs = local?.campo === 'obs' || (m.isError && pideObs);
  const errNa = local?.campo === 'na' || (m.isError && pideNa);

  const elegir = (v: EstadoEvaluacion) => { onEstado(v); setLocal(null); m.reset(); };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!estado) { setLocal({ campo: 'estado', msg: 'Elige el estado del control.' }); form.current?.querySelector<HTMLInputElement>('.seg input')?.focus(); return; }
    // Validación en el cliente (RNF03) con el mismo mensaje que la API; el servidor valida igualmente.
    if (pideObs && obs.trim().length < MIN_TEXTO_EVALUACION) { setLocal({ campo: 'obs', msg: MSG_CP04 }); document.getElementById(`ev-obs-${ev.id}`)?.focus(); return; }
    if (pideNa && na.trim().length < MIN_TEXTO_EVALUACION) { setLocal({ campo: 'na', msg: MSG_CP05 }); document.getElementById(`ev-na-${ev.id}`)?.focus(); return; }
    setLocal(null);
    const ultimo = ultimoPendiente;
    m.mutate({ idEvaluacion: ev.id, body: { estado, observaciones: obs.trim() || null, justificacion_na: pideNa ? na.trim() : null } }, {
      onSuccess: () => { setEraUltimo(ultimo); onGuardado(); requestAnimationFrame(() => { if (aviso.current) cascada(aviso.current.children, 80, 6); }); },
    });
  };

  return (
    <form className="td-eval" ref={form} onSubmit={enviar} noValidate>
      <fieldset>
        <legend className="rot">Estado de la evaluación</legend>
        <div className={`seg${estado ? '' : ' sin'}`} style={{ '--i': i, '--c': i % 2, '--f': i >> 1 } as React.CSSProperties}>
          <span className="seg-ind" aria-hidden="true" />
          {ESTADOS_EVALUACION.map(v => (
            <label key={v}><input type="radio" name={`estado-${ev.id}`} value={v} checked={v === estado} onChange={() => elegir(v)} /><Marca estado={v} /><span>{NOMBRE_EVALUACION[v]}</span></label>
          ))}
        </div>
      </fieldset>
      {!pideNa && (
        <div className="campo-w">
          <label htmlFor={`ev-obs-${ev.id}`}>Observaciones <small>{pideObs ? 'obligatorias' : 'opcionales'}</small></label>
          <textarea className="campo" id={`ev-obs-${ev.id}`} value={obs} onChange={e => { setObs(e.target.value); setLocal(null); }} aria-invalid={errObs || undefined} aria-describedby={error ? `ev-error-${ev.id}` : undefined} />
        </div>
      )}
      {pideNa && (
        <div className="campo-w">
          <label htmlFor={`ev-na-${ev.id}`}>Justificación de la exclusión <small>obligatoria</small></label>
          <textarea className="campo" id={`ev-na-${ev.id}`} value={na} onChange={e => { setNa(e.target.value); setLocal(null); }} aria-invalid={errNa || undefined} aria-describedby={error ? `ev-error-${ev.id}` : undefined} />
        </div>
      )}
      {error && <MensajeError id={`ev-error-${ev.id}`}>{error}</MensajeError>}
      <div className="td-guardar">
        <button className="btn" type="submit" disabled={m.isPending}>{m.isPending ? 'Guardando…' : 'Guardar evaluación'}</button>
        {/* Al guardar: la hora y el siguiente por evaluar */}
        <div className="td-aviso" ref={aviso} role="status">
          {m.isSuccess && !local ? (
            <>
              <span>Guardado a las {hora(m.data.evaluado_en)}.</span>
              {siguiente ? <button className="td-sig" type="button" onClick={() => onIr(siguiente.id)}>Siguiente por evaluar: {siguiente.control.codigo_iso} {siguiente.control.nombre}</button>
                : eraUltimo && <span>Todos los controles están evaluados.</span>}
            </>
          ) : sinEvaluar(ev) ? <span>Sin evaluar todavía.</span> : <span>Evaluado el {fecha(ev.evaluado_en)} a las {hora(ev.evaluado_en)}.</span>}
        </div>
      </div>
    </form>
  );
}
