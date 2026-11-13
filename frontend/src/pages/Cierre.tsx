import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuditoria, useCambiarEstado, useInforme, useIntegridad, useTrazabilidad } from '../api/queries';
import type { Anomalia, AuditoriaDetalle, Evaluacion, TipoAnomalia } from '../api/types';
import { Marca, MensajeError } from '../components/basicos';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { FormEvidencia, FormHallazgo, FormRecomendacion } from '../components/Formularios';
import { MantenerParaSellar } from '../components/MantenerParaSellar';
import { Sello } from '../components/Sello';
import { ANOMALIA, NOMBRE_EVALUACION, pct, plural } from '../lib/format';
import { nodosDe, tramosVivos, trazaCompleta } from '../lib/traza';
import { cascada } from '../motion/efectos';
import { gsap } from '../motion/gsap';
import { EASE, prefersReducedMotion, tween } from '../motion/motion';
import { Acta } from './Acta';

export default function Cierre() {
  const id = Number(useParams().id);
  const q = useAuditoria(id);
  /** Si ya estaba cerrada al llegar, se va directa al acta; si se cierra aquí, se espera a que la hoja se selle. */
  const cerradaAlLlegar = useRef<boolean | null>(null);
  const [sellada, setSellada] = useState(false);
  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  if (q.data.auditoria.estado === 'BORRADOR') return (
    <div className="prosa">
      <p><b>Esta auditoría está en Borrador.</b> No hay nada que revisar hasta que se defina su alcance.</p>
      <p><Link className="enlace" to="/auditorias">Volver a las auditorías</Link></p>
    </div>
  );
  if (cerradaAlLlegar.current === null) cerradaAlLlegar.current = q.data.auditoria.estado === 'CERRADA';
  if (q.data.auditoria.estado === 'CERRADA' && (cerradaAlLlegar.current || sellada)) return <Acta id={id} datos={q.data} />;
  return <Hoja id={id} datos={q.data} onSellada={() => setSellada(true)} />;
}

// Reparto del progreso --p durante el cierre (el CSS usa los mismos tramos, ver hoja.css):
// 0–0,5 la línea fija las filas · 0,42–0,84 se fijan los trazos del sello · 0,84–1 aparece el centro.
const MS_CIERRE = 2600;

type FormAbierto = { idEvaluacion: number; tipo: TipoAnomalia; idHallazgo?: number };
function Hoja({ id, datos, onSellada }: { id: number; datos: AuditoriaDetalle; onSellada: () => void }) {
  const { auditoria, evaluaciones } = datos;
  const cerrada = auditoria.estado === 'CERRADA';
  const traz = useTrazabilidad(id, !cerrada);
  const integ = useIntegridad(id, true);
  const informe = useInforme(id, cerrada);
  const cambiar = useCambiarEstado(id);

  const acta = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLOListElement>(null);
  const pulso = useRef<HTMLLIElement>(null);
  const cancelar = useRef<() => void>(() => {});
  // El JS solo escribe el progreso; qué significa cada tramo lo decide el CSS.
  const progreso = useCallback((p: number) => { acta.current?.style.setProperty('--p', p.toFixed(4)); }, []);
  useLayoutEffect(() => { progreso(cerrada ? 1 : 0); return () => cancelar.current(); }, []); // solo al montar: el estado inicial de la hoja

  const [abierto, setAbierto] = useState<FormAbierto | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  /** Sube cuando la API rechaza el cierre: el botón de mantener vuelve a cero. */
  const [reinicio, setReinicio] = useState(0);
  /** Las trazas se dibujan al abrir la hoja, fila a fila. */
  const [dibujada, setDibujada] = useState(false), [entrando, setEntrando] = useState(true);
  useEffect(() => { if (filas.current) cascada(filas.current.querySelectorAll('.fila'), 40); }, []);
  useEffect(() => { const a = requestAnimationFrame(() => setDibujada(true)), t = window.setTimeout(() => setEntrando(false), 1800); return () => { cancelAnimationFrame(a); clearTimeout(t); }; }, []);
  /** El gesto de mantener enciende los trazos del sello: el JS solo escribe --h. */
  const gesto = useCallback((h: number) => { acta.current?.style.setProperty('--h', h.toFixed(4)); }, []);

  // Al registrar algo, la señal baja por el margen desde la fila hasta la puerta de cierre.
  const filaResuelta = useRef<number | null>(null);
  useEffect(() => {
    const idEv = filaResuelta.current;
    if (idEv === null) return;
    filaResuelta.current = null;
    const fila = filas.current?.querySelector<HTMLElement>(`[data-id="${idEv}"]`);
    const toma = fila?.querySelector<HTMLElement>('.toma');
    const punto = pulso.current, caja = filas.current;
    if (!toma || !punto || !caja || prefersReducedMotion() || typeof punto.animate !== 'function') return;
    const t = setTimeout(() => {
      const c = caja.getBoundingClientRect(), y1 = toma.getBoundingClientRect().top - c.top, y2 = c.height - 6;
      punto.animate(
        [{ transform: `translateY(${y1}px)`, opacity: 1 }, { transform: `translateY(${y2}px)`, opacity: 1, offset: 0.9 }, { transform: `translateY(${y2}px)`, opacity: 0 }],
        { duration: Math.max(300, (y2 - y1) * 1.5), easing: EASE.estado },
      );
    }, 700);
    return () => clearTimeout(t);
  }, [datos]);

  // El eslabón que acaba de entrar en la bitácora se resalta un momento en el anillo.
  const eslabones = integ.data?.eslabones;
  const nAnterior = useRef<number | null>(null);
  const [idNuevo, setIdNuevo] = useState<number | null>(null);
  useEffect(() => {
    if (!eslabones) return;
    const antes = nAnterior.current;
    nAnterior.current = eslabones.length;
    if (antes === null || eslabones.length <= antes) return;
    setIdNuevo(eslabones[eslabones.length - 1]!.id);
    const t = setTimeout(() => setIdNuevo(null), 2400);
    return () => clearTimeout(t);
  }, [eslabones]);

  const hecho = (idEvaluacion: number) => { filaResuelta.current = idEvaluacion; setAbierto(null); };

  const cerrar = () => {
    setConfirmando(false); setAbierto(null);
    cambiar.mutate('CERRADA', {
      // Llega aquí con el detalle y la bitácora ya recargados (incluido el eslabón de cierre).
      // La línea fija las filas, el sello se completa y, al terminar, la hoja se archiva hacia arriba y aparece el acta
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

  const anomaliasDe = (e: Evaluacion): Anomalia[] => (cerrada ? [] : (traz.data?.anomalias ?? []).filter(a => a.id_evaluacion === e.id));
  const completas = evaluaciones.filter(e => trazaCompleta(nodosDe(e))).length;
  const apta = traz.data?.apta_para_cierre === true;
  const v = integ.data;
  const inf = informe.data?.informe;
  const fechaCierre = cerrada && inf ? inf.fecha_generacion.slice(0, 10) : null;
  const cifra = cerrada && inf ? pct(Number(inf.cumplimiento_pct)) : null;

  return (
    <div className={`acta${apta || cerrada ? ' apta' : ''}`} ref={acta} data-estado={auditoria.estado} style={{ '--n': evaluaciones.length } as React.CSSProperties}>
      <div className="hoja">
        <div className="hoja-cuerpo">
          <div className="hoja-cols" aria-hidden="true"><span>Control</span><span /><span>Estado</span><div className="traza-cols"><span>Evidencia</span><span>Hallazgo</span><span>Recomendación</span><span /></div></div>
          <ol className={`hoja-filas${dibujada ? ' dibujada' : ''}${entrando ? ' entrando' : ''}`} ref={filas}>
            {evaluaciones.map((e, i) => {
              const nodos = nodosDe(e), vivos = tramosVivos(nodos), anoms = anomaliasDe(e);
              return (
                <li key={e.id} className={`fila${trazaCompleta(nodos) ? ' completa' : ''}`} data-id={e.id} style={{ '--i': i } as React.CSSProperties}>
                  <span className="cod num">{e.control.codigo_iso}</span>
                  <span>{e.control.nombre}</span>
                  <span className="est"><Marca estado={e.estado} />{NOMBRE_EVALUACION[e.estado]}</span>
                  <div className="traza" role="img" aria-label={trazaCompleta(nodos) ? 'Traza completa' : 'Traza incompleta'}>
                    {nodos.map((n, k) => <span key={k} className={`tramo${vivos[k] ? ' on' : ''}`} data-n={n} style={{ '--k': k } as React.CSSProperties}><i className="hilo" /><i className="nodo" /></span>)}
                    <i className="toma" />
                  </div>
                  {anoms.map(a => {
                    const esEste = abierto?.idEvaluacion === e.id && abierto.tipo === a.tipo && abierto.idHallazgo === a.id_hallazgo;
                    return (
                      <div className="msg" key={`${a.tipo}-${a.id_hallazgo ?? 0}`}>
                        <span>{a.mensaje}</span>
                        {!esEste && <button className="btn sec min" type="button" onClick={() => setAbierto({ idEvaluacion: e.id, tipo: a.tipo, idHallazgo: a.id_hallazgo })}>{ANOMALIA[a.tipo].accion}</button>}
                        {esEste && a.tipo === 'CP-06_DISONANCIA_PROBATORIA' && <FormEvidencia idAuditoria={id} idEvaluacion={e.id} onHecho={() => hecho(e.id)} onCancelar={() => setAbierto(null)} destino={() => filas.current?.querySelector(`[data-id="${e.id}"] .tramo[data-n="falta"] .nodo`) ?? null} />}
                        {esEste && a.tipo === 'CONTROL_SIN_HALLAZGO' && <FormHallazgo idAuditoria={id} idEvaluacion={e.id} criterio={e.control.criterio_evaluacion} onHecho={() => hecho(e.id)} onCancelar={() => setAbierto(null)} destino={() => filas.current?.querySelector(`[data-id="${e.id}"] .tramo[data-n="falta"] .nodo`) ?? null} />}
                        {esEste && a.tipo === 'CP-08_HALLAZGO_HUERFANO' && a.id_hallazgo !== undefined && <FormRecomendacion idAuditoria={id} idHallazgo={a.id_hallazgo} onHecho={() => hecho(e.id)} onCancelar={() => setAbierto(null)} destino={() => filas.current?.querySelector(`[data-id="${e.id}"] .tramo[data-n="falta"] .nodo`) ?? null} />}
                      </div>
                    );
                  })}
                </li>
              );
            })}
            <li className="bus" aria-hidden="true"><i /></li>
            <li className="pulso" ref={pulso} aria-hidden="true" />
          </ol>
          <div className="platina" />
        </div>

        <footer className="hoja-pie">
          <div className="pie-txt">
            <div>
              <p className="num"><b>{completas} de {evaluaciones.length} trazas completas</b>{eslabones && <> · {plural(eslabones.length, 'eslabón', 'eslabones')} en la bitácora</>}</p>
              {traz.isError ? <MensajeError>{traz.error.message}</MensajeError>
                : cerrada ? <p className="sub" role="status">Cerrada. Fijando la hoja y sellando el acta…</p>
                : !traz.data ? <p className="sub">Consultando la trazabilidad…</p>
                : apta ? <p className="resumen"><span>Trazabilidad completa: la API no informa de anomalías. Después de cerrar, la auditoría no admite cambios.</span></p>
                : <p className="resumen num">{(Object.keys(ANOMALIA) as TipoAnomalia[]).map(t => <span key={t}>{ANOMALIA[t].resumen}: <b>{traz.data.resumen[t] ?? 0}</b></span>)}</p>}
              {!cerrada && (
                <div className="fila-acc">
                  {confirmando ? (
                    <>
                      <button className="btn" type="button" onClick={cerrar} disabled={cambiar.isPending}>Confirmar el cierre definitivo</button>
                      <button className="enlace" type="button" onClick={() => setConfirmando(false)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      {/* Cerrar no tiene vuelta atrás: hay que mantener el botón. Mientras, el sello se va completando. */}
                      <MantenerParaSellar etiqueta={cambiar.isPending ? 'Cerrando…' : 'Mantén pulsado para cerrar'} disabled={!apta || cambiar.isPending} onProgreso={gesto} onCompleto={cerrar} reinicio={reinicio} />
                      {apta && <button className="enlace" type="button" onClick={() => setConfirmando(true)}>Cerrar sin mantener</button>}
                      <Link className="enlace" to={`/auditorias/${id}`}>Volver a la evaluación</Link>
                    </>
                  )}
                </div>
              )}
              {cambiar.isError && <MensajeError>{cambiar.error.message}{cambiar.error.body.total_anomalias ? ` ${plural(cambiar.error.body.total_anomalias, 'anomalía pendiente', 'anomalías pendientes')}.` : ''}</MensajeError>}
            </div>
          </div>
          <Sello eslabones={eslabones ?? []} verificacion={cerrada && v ? v : null} cifra={cifra} fechaCierre={fechaCierre} idNuevo={idNuevo} />
        </footer>
      </div>
    </div>
  );
}

