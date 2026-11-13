import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate as animar, stagger } from 'animejs';
import { animate as resorte } from 'motion';
import { Link } from 'react-router-dom';
import { useCambiarEstado, useInforme, useIntegridad, useTrazabilidad } from '../api/queries';
import type { Anomalia, AuditoriaDetalle, Evaluacion, TipoAnomalia } from '../api/types';
import { Marca, MensajeError } from '../components/basicos';
import { FormEvidencia, FormHallazgo, FormRecomendacion } from '../components/Formularios';
import { Rueda } from '../components/informe/contenido';
import { MantenerParaSellar } from '../components/MantenerParaSellar';
import { Sello } from '../components/Sello';
import { ANOMALIA, NOMBRE_EVALUACION, pct, plural } from '../lib/format';
import { nodosDe, trazaCompleta, type Nodo } from '../lib/traza';
import { brincar, cascada, moverIndicador } from '../motion/efectos';
import { CURVA, Flip, gsap } from '../motion/gsap';
import { prefersReducedMotion, tween } from '../motion/motion';

// Reparto del progreso --p durante el cierre (el CSS usa los mismos tramos, ver hoja.css):
// 0–0,5 la línea fija las filas · 0,42–0,84 se fijan los trazos del sello · 0,84–1 aparece el centro.
const MS_CIERRE = 2600;
/** Qué tramo de la traza completa cada tipo de anomalía: hacia ahí se pliega su formulario. */
const TRAMO: Record<TipoAnomalia, number> = { 'CP-06_DISONANCIA_PROBATORIA': 0, CONTROL_SIN_HALLAZGO: 1, 'CP-08_HALLAZGO_HUERFANO': 2 };
const NOMBRE_TRAMO = ['evidencia', 'hallazgo', 'recomendación'] as const;
const RESUMEN: Record<TipoAnomalia, string> = { 'CP-06_DISONANCIA_PROBATORIA': 'sin evidencia', CONTROL_SIN_HALLAZGO: 'sin hallazgo', 'CP-08_HALLAZGO_HUERFANO': 'sin recomendación' };
const claseDe = (n: Nodo): string => (n === 'ok' ? 's-si' : n === 'no' ? 's-na' : 's-falta');

type FormAbierto = { idEvaluacion: number; tipo: TipoAnomalia; idHallazgo?: number };
type Vista = 'pend' | 'todos';

/**
 * La revisión antes del cierre. La tabla de trazas por cláusula (por defecto, solo lo pendiente) y, fija abajo,
 * la puerta de cierre: cuántas trazas están completas, qué falta, ir a la siguiente y mantener pulsado para cerrar.
 * Cada anomalía se arregla en su fila: el formulario se despliega, se pliega hacia el nudo que faltaba al guardar
 * y una señal baja hasta la puerta. Si la auditoría se puede cerrar lo decide la API (GET /trazabilidad).
 */
export function Revision({ id, datos, onSellada }: { id: number; datos: AuditoriaDetalle; onSellada: () => void }) {
  const { auditoria, evaluaciones } = datos;
  const cerrada = auditoria.estado === 'CERRADA';
  const traz = useTrazabilidad(id, !cerrada);
  const integ = useIntegridad(id, true);
  const informe = useInforme(id, cerrada);
  const cambiar = useCambiarEstado(id);

  const acta = useRef<HTMLDivElement>(null), tabla = useRef<HTMLDivElement>(null), gVista = useRef<HTMLDivElement>(null);
  const cancelar = useRef<() => void>(() => {});
  // El JS solo escribe el progreso; qué significa cada tramo lo decide el CSS.
  const progreso = useCallback((p: number) => { acta.current?.style.setProperty('--p', p.toFixed(4)); }, []);
  /** El gesto de mantener enciende los trazos del sello: el JS solo escribe --h. */
  const gesto = useCallback((h: number) => { acta.current?.style.setProperty('--h', h.toFixed(4)); }, []);
  useLayoutEffect(() => { progreso(cerrada ? 1 : 0); return () => cancelar.current(); }, []); // solo al montar

  const [abierto, setAbierto] = useState<FormAbierto | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  /** Sube cuando la API rechaza el cierre: el botón de mantener vuelve a cero. */
  const [reinicio, setReinicio] = useState(0);
  const [vista, setVista] = useState<Vista>('pend');
  /** Filas recién resueltas: se quedan un momento en «Pendientes» antes de irse. */
  const [recientes, setRecientes] = useState<ReadonlySet<number>>(new Set());

  const anomalias: Anomalia[] = cerrada ? [] : traz.data?.anomalias ?? [];
  const apta = traz.data?.apta_para_cierre === true;
  const pendientes = useMemo(() => new Set(anomalias.map(a => a.id_evaluacion)), [anomalias]);
  // Sin nada pendiente al llegar, se abre directamente con todas las filas
  const decidida = useRef(false);
  useEffect(() => { if (!decidida.current && traz.data) { decidida.current = true; if (!traz.data.anomalias.length) setVista('todos'); } }, [traz.data]);

  const visibles = vista === 'todos' || cerrada ? evaluaciones : evaluaciones.filter(e => pendientes.has(e.id) || recientes.has(e.id));
  const grupos = useMemo(() => {
    const g = new Map<string, Evaluacion[]>();
    visibles.forEach(e => { const k = `${e.control.clausula} · ${e.control.categoria_tema}`; if (!g.has(k)) g.set(k, []); g.get(k)!.push(e); });
    return [...g];
  }, [visibles]);
  const completas = evaluaciones.filter(e => trazaCompleta(nodosDe(e))).length;

  // Las filas viajan a su sitio cuando cambian las visibles (GSAP Flip): se anota dónde estaban antes
  const antes = useRef<Flip.FlipState | null>(null);
  const anotar = () => { if (tabla.current && !prefersReducedMotion()) antes.current = Flip.getState(tabla.current.querySelectorAll('.rv-fila, .rv-grupo-cab')); };
  useLayoutEffect(() => {
    moverIndicador(gVista.current, antes.current !== null);
    const estado = antes.current, el = tabla.current; antes.current = null;
    if (!estado || !el) return;
    const ctx = gsap.context(() => {
      Flip.from(estado, { targets: el.querySelectorAll('.rv-fila, .rv-grupo-cab'), duration: 0.55, ease: CURVA.cambio, absoluteOnLeave: true,
        onLeave: els => gsap.to(els, { opacity: 0, x: -24, duration: 0.35 }),
        onEnter: els => gsap.fromTo(els, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: CURVA.entrada, clearProps: 'all' }) });
    });
    return () => ctx.revert();
  }, [vista, recientes]);
  const cambiarVista = (v: Vista) => { if (v !== vista) { anotar(); setVista(v); } };

  // Entrada: filas en cascada y la barra de la puerta, casilla a casilla
  useEffect(() => {
    if (prefersReducedMotion() || !acta.current) return;
    cascada(acta.current.querySelectorAll('.rv-cab, .rv-leyenda, .rv-grupo-cab, .rv-fila'), 35);
    animar(acta.current.querySelectorAll('.pt-barra i'), { scaleY: [0, 1], duration: 400, ease: 'outBack', delay: stagger(30, { start: 300 }) });
  }, []);

  // Al resolver una fila: su traza se cierra, la señal baja hasta la puerta y, al rato, la fila se va de «Pendientes»
  const resuelta = useRef<number | null>(null);
  const hecho = (idEv: number) => { resuelta.current = idEv; setAbierto(null); setRecientes(s => new Set(s).add(idEv)); };
  useEffect(() => {
    const idEv = resuelta.current; if (idEv === null) return;
    resuelta.current = null;
    const fila = tabla.current?.querySelector<HTMLElement>(`[data-id="${idEv}"]`), fin = fila?.querySelector('.ac-fin'), destino = acta.current?.querySelector('.rv-puerta .sello');
    if (fila && !prefersReducedMotion()) resorte(Array.from(fila.querySelectorAll('.ac-tz.s-si i, .ac-fin')), { scale: [0, 1.4, 1] }, { duration: 0.5, ease: [0.16, 1, 0.3, 1] });
    if (fin && destino && !prefersReducedMotion()) {
      const a = fin.getBoundingClientRect(), b = destino.getBoundingClientRect(), s = document.createElement('i');
      s.className = 'rv-senal'; document.body.appendChild(s);
      gsap.fromTo(s, { x: a.left, y: a.top }, { x: b.left + b.width / 2 - 5, y: b.top + b.height / 2 - 5, duration: 0.9, ease: CURVA.cambio, onComplete: () => { s.remove(); brincar(destino, 0.85); brincar(acta.current?.querySelector('.pt-t') ?? null, 0.96); } });
    }
    const t = window.setTimeout(() => {
      anotar(); setRecientes(s => { const x = new Set(s); x.delete(idEv); return x; });
      // Con todo resuelto, la tabla pasa a «Todos»: se ven las trazas completas
      if (traz.data && !traz.data.anomalias.length) setVista('todos');
    }, 1400);
    return () => clearTimeout(t);
  }, [datos, traz.data]);

  const siguiente = () => {
    const a = anomalias[0]; if (!a) return;
    if (vista !== 'pend') { anotar(); setVista('pend'); }
    setAbierto({ idEvaluacion: a.id_evaluacion, tipo: a.tipo, idHallazgo: a.id_hallazgo });
    requestAnimationFrame(() => tabla.current?.querySelector(`[data-id="${a.id_evaluacion}"]`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' }));
  };

  const cerrar = () => {
    setConfirmando(false); setAbierto(null); setVista('todos');
    cambiar.mutate('CERRADA', {
      // Llega aquí con el detalle y la bitácora ya recargados (incluido el eslabón de cierre).
      // La línea fija las filas, el sello se completa y, al terminar, la hoja se archiva hacia arriba y aparece el acta.
      onSuccess: () => {
        cancelar.current = tween(0, 1, MS_CIERRE, progreso, () => {
          gesto(0);
          if (prefersReducedMotion() || !acta.current) { onSellada(); return; }
          gsap.to(acta.current, { y: -40, opacity: 0, duration: 0.5, delay: 0.5, ease: 'power3.in', onComplete: onSellada });
        });
      },
      onError: () => { setReinicio(x => x + 1); void traz.refetch(); },
    });
  };

  const eslabones = integ.data?.eslabones, v = integ.data, inf = informe.data?.informe;
  const fechaCierre = cerrada && inf ? inf.fecha_generacion.slice(0, 10) : null;
  const cifra = cerrada && inf ? pct(Number(inf.cumplimiento_pct)) : null;
  const resumen = traz.data ? (Object.entries(traz.data.resumen) as [TipoAnomalia, number][]).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${RESUMEN[t]}`).join(' · ') : '';
  let indice = 0;

  return (
    <div className={`acta rv${apta || cerrada ? ' apta' : ''}`} ref={acta} data-estado={auditoria.estado} style={{ '--n': visibles.length } as React.CSSProperties}>
      <header className="rv-cab">
        <div>
          <h2>Revisión antes del cierre</h2>
          <p>{cerrada ? 'Cerrada. Fijando la hoja y sellando el acta…'
            : apta ? 'Todas las trazas están completas. Cierra la auditoría desde la puerta de abajo.'
            : 'Cada control necesita su traza completa: los implementados, su evidencia; los parciales y no implementados, su hallazgo; y cada hallazgo, su recomendación.'}
            {!cerrada && traz.data && !apta && ` La API informa de ${plural(traz.data.total_anomalias, 'anomalía', 'anomalías')}.`}</p>
        </div>
        {!cerrada && (
          <div className="chips" ref={gVista} role="group" aria-label="Mostrar">
            <span className="chip-ind" aria-hidden="true" />
            <button className="chip" type="button" aria-pressed={vista === 'pend'} onClick={() => cambiarVista('pend')}>Pendientes <span className="num">{anomalias.length ? pendientes.size : 0}</span></button>
            <button className="chip" type="button" aria-pressed={vista === 'todos'} onClick={() => cambiarVista('todos')}>Todos <span className="num">{evaluaciones.length}</span></button>
          </div>
        )}
      </header>
      <div className="rv-leyenda"><span><i className="l-nodo" />registrado</span><span><i className="l-falta" />falta</span><span><i className="l-na" />no aplica a su estado</span><span><i className="l-fin" />traza completa</span></div>

      <div className="hoja-cuerpo rv-tabla" ref={tabla}>
        <div className="rv-fila-g rv-t-cab" aria-hidden="true"><span>N.º</span><span>Control</span><span>Estado</span><span>Evidencia</span><span>Hallazgo</span><span>Recomendación</span><span /></div>
        {traz.isError && <MensajeError>{traz.error.message}</MensajeError>}
        {grupos.length === 0 && traz.data && <p className="sub rv-vacio">No queda nada pendiente: todas las trazas están completas.</p>}
        {grupos.map(([g, es]) => (
          <div key={g} role="group" aria-label={g}>
            <div className="rv-grupo-cab" data-flip-id={`g${g}`}><b>{g}</b><span className="num">{plural(es.length, 'control', 'controles')}</span></div>
            {es.map(e => {
              const nodos = nodosDe(e), completa = trazaCompleta(nodos), na = e.estado === 'NO_APLICABLE', anoms = anomalias.filter(a => a.id_evaluacion === e.id);
              const i = indice++;
              return (
                <div key={e.id} className={`rv-fila${recientes.has(e.id) && !anoms.length ? ' resuelta' : ''}`} data-id={e.id} data-flip-id={`f${e.id}`} style={{ '--i': i } as React.CSSProperties}>
                  <div className="rv-fila-g rv-fila-c">
                    <span className="f-cod num">{e.control.codigo_iso}</span>
                    <span className="f-nom">{e.control.nombre}</span>
                    <span className="f-est"><Marca estado={e.estado} />{NOMBRE_EVALUACION[e.estado]}</span>
                    <span className="ac-tzs">
                      {nodos.map((n, k) => <span key={k} className={`ac-tz ${claseDe(n)}`} data-k={k} title={n === 'ok' ? `${NOMBRE_TRAMO[k]} registrada` : n === 'no' ? `${NOMBRE_TRAMO[k]}: no aplica a su estado` : `Falta: ${NOMBRE_TRAMO[k]}`}><i /></span>)}
                      <b className={`ac-fin${na ? ' na' : completa ? '' : ' inc'}`} />
                    </span>
                  </div>
                  {anoms.map(a => {
                    const esEste = abierto?.idEvaluacion === e.id && abierto.tipo === a.tipo && abierto.idHallazgo === a.id_hallazgo;
                    const hueco = () => tabla.current?.querySelector(`[data-id="${e.id}"] .ac-tz[data-k="${TRAMO[a.tipo]}"] i`) ?? null;
                    return (
                      <Fragment key={`${a.tipo}-${a.id_hallazgo ?? 0}`}>
                        <div className="rv-anom"><p>{a.mensaje}</p>{!esEste && <button className="btn sec min" type="button" onClick={() => setAbierto({ idEvaluacion: e.id, tipo: a.tipo, idHallazgo: a.id_hallazgo })}>{ANOMALIA[a.tipo].accion}</button>}</div>
                        {esEste && (
                          <div className="rv-form">
                            {a.tipo === 'CP-06_DISONANCIA_PROBATORIA' && <FormEvidencia idAuditoria={id} idEvaluacion={e.id} onHecho={() => hecho(e.id)} onCancelar={() => setAbierto(null)} destino={hueco} />}
                            {a.tipo === 'CONTROL_SIN_HALLAZGO' && <FormHallazgo idAuditoria={id} idEvaluacion={e.id} criterio={e.control.criterio_evaluacion} onHecho={() => hecho(e.id)} onCancelar={() => setAbierto(null)} destino={hueco} />}
                            {a.tipo === 'CP-08_HALLAZGO_HUERFANO' && a.id_hallazgo !== undefined && <FormRecomendacion idAuditoria={id} idHallazgo={a.id_hallazgo} onHecho={() => hecho(e.id)} onCancelar={() => setAbierto(null)} destino={hueco} />}
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
        <div className="platina" />
      </div>

      {/* La puerta de cierre: fija abajo, siempre a la vista */}
      <div className={`rv-puerta${apta ? ' apta' : ''}`}>
        <div className="rv-puerta-in">
          <div className="rv-pt-txt">
            <p className="pt-t num" role="status"><Rueda valor={completas} /> de {evaluaciones.length} trazas completas{eslabones && <span className="sub"> · {plural(eslabones.length, 'eslabón', 'eslabones')} en la bitácora</span>}</p>
            <div className="pt-barra" aria-hidden="true">{evaluaciones.map(e => <i key={e.id} className={trazaCompleta(nodosDe(e)) ? 'on' : undefined} />)}</div>
            <p className="pt-s">{cerrada ? 'Cerrada. Fijando la hoja y sellando el acta…' : !traz.data ? 'Consultando la trazabilidad…'
              : apta ? 'Trazabilidad completa: la API no informa de anomalías. Después de cerrar, la auditoría no admite cambios.'
              : `${plural(traz.data.total_anomalias, 'anomalía', 'anomalías')}: ${resumen}`}</p>
            {cambiar.isError && <MensajeError>{cambiar.error.message}{cambiar.error.body.total_anomalias ? ` ${plural(cambiar.error.body.total_anomalias, 'anomalía pendiente', 'anomalías pendientes')}.` : ''}</MensajeError>}
          </div>
          {!cerrada && (
            <div className="pt-acc">
              {confirmando ? (
                <>
                  <button className="btn" type="button" onClick={cerrar} disabled={cambiar.isPending}>Confirmar el cierre definitivo</button>
                  <button className="enlace" type="button" onClick={() => setConfirmando(false)}>Cancelar</button>
                </>
              ) : (
                <>
                  {!apta && traz.data && <button className="btn sec" type="button" onClick={siguiente}>Ir a la siguiente</button>}
                  {/* Cerrar no tiene vuelta atrás: hay que mantener el botón. Mientras, el sello se va completando. */}
                  <MantenerParaSellar etiqueta={cambiar.isPending ? 'Cerrando…' : <>Mantén<span className="largo"> pulsado</span> para cerrar</>} disabled={!apta || cambiar.isPending} onProgreso={gesto} onCompleto={cerrar} reinicio={reinicio} />
                  {apta && <button className="enlace" type="button" onClick={() => setConfirmando(true)}>Cerrar sin mantener</button>}
                </>
              )}
            </div>
          )}
          <div className="pt-sello"><Sello eslabones={eslabones ?? []} verificacion={cerrada && v ? v : null} cifra={cifra} fechaCierre={fechaCierre} idNuevo={null} /></div>
        </div>
      </div>
      {!cerrada && <p className="rv-volver"><Link className="enlace" to={`/auditorias/${id}`}>Volver a la evaluación</Link></p>}
    </div>
  );
}
