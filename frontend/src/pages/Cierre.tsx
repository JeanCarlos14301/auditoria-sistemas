import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuditoria, useCambiarEstado, useInforme, useIntegridad, useTrazabilidad } from '../api/queries';
import type { Anomalia, AuditoriaDetalle, Evaluacion, TipoAnomalia, VerificacionIntegridad } from '../api/types';
import { Estados, Marca, MensajeError } from '../components/basicos';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { FormEvidencia, FormHallazgo, FormRecomendacion } from '../components/Formularios';
import { Historia } from '../components/Historia';
import { MantenerParaSellar } from '../components/MantenerParaSellar';
import { Postura } from '../components/Postura';
import { Sello, textoOrla } from '../components/Sello';
import { SelloRelieve } from '../components/SelloRelieve';
import { ANOMALIA, NOMBRE_EVALUACION, fecha, hora, pct, plural, NOMBRE_CHECK } from '../lib/format';
import { nodosDe, tramosVivos, trazaCompleta } from '../lib/traza';
import { cascada } from '../motion/efectos';
import { EASE, prefersReducedMotion, reentrar, tween } from '../motion/motion';

export default function Cierre() {
  const id = Number(useParams().id);
  const q = useAuditoria(id);
  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  if (q.data.auditoria.estado === 'BORRADOR') return (
    <div className="prosa">
      <h1 className="titulo-pagina">{q.data.auditoria.organizacion}</h1>
      <p><b>Esta auditoría está en Borrador.</b> No hay nada que revisar hasta que se defina su alcance.</p>
      <p><Link className="enlace" to="/auditorias">Volver a las auditorías</Link></p>
    </div>
  );
  return <Hoja id={id} datos={q.data} />;
}

// Reparto del progreso --p durante el cierre (el CSS usa los mismos tramos, ver hoja.css):
// 0–0,5 la línea fija las filas · 0,42–0,84 se fijan los trazos del sello · 0,84–1 aparece el centro.
const P_SELLO_INICIO = 0.42, P_SELLO_TRAMO = 0.42, MS_CIERRE = 2600;

type FormAbierto = { idEvaluacion: number; tipo: TipoAnomalia; idHallazgo?: number };
function Hoja({ id, datos }: { id: number; datos: AuditoriaDetalle }) {
  const { auditoria, evaluaciones } = datos;
  const cerrada = auditoria.estado === 'CERRADA';
  // 'abierta': se puede trabajar · 'cerrando': la API ya cerró y la hoja se está fijando · 'cerrada': sellada
  const [fase, setFase] = useState<'abierta' | 'cerrando' | 'cerrada'>(cerrada ? 'cerrada' : 'abierta');
  const traz = useTrazabilidad(id, !cerrada);
  const integ = useIntegridad(id, true);
  const informe = useInforme(id, cerrada);
  const cambiar = useCambiarEstado(id);

  const acta = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLOListElement>(null);
  const pulso = useRef<HTMLLIElement>(null);
  const resultado = useRef<HTMLParagraphElement>(null);
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
  const [verificando, setVerificando] = useState(false);
  const [recompuesto, setRecompuesto] = useState(0);

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
      onSuccess: () => { setFase('cerrando'); cancelar.current = tween(0, 1, MS_CIERRE, progreso, () => { setFase('cerrada'); gesto(0); }); },
      onError: () => { setReinicio(x => x + 1); void traz.refetch(); },
    });
  };

  const verificar = async () => {
    setVerificando(true);
    const r = await integ.refetch();
    setVerificando(false);
    const v = r.data;
    if (!v) return;
    cancelar.current(); setRecompuesto(x => x + 1);
    // Íntegra: el anillo se recorre entero. Rota: se detiene en el último eslabón que se pudo verificar.
    const hasta = v.integra ? 1 : P_SELLO_INICIO + P_SELLO_TRAMO * (v.cadena.eslabones_verificados / Math.max(1, v.cadena.total_eslabones));
    cancelar.current = tween(P_SELLO_INICIO, hasta, v.integra ? 1100 : 700, progreso, () => { progreso(1); reentrar(resultado.current); });
  };

  const anomaliasDe = (e: Evaluacion): Anomalia[] => (cerrada ? [] : (traz.data?.anomalias ?? []).filter(a => a.id_evaluacion === e.id));
  const completas = evaluaciones.filter(e => trazaCompleta(nodosDe(e))).length;
  const apta = traz.data?.apta_para_cierre === true;
  const v: VerificacionIntegridad | undefined = integ.data;
  const inf = informe.data?.informe;
  const sellada = fase === 'cerrada' && cerrada;
  const tipos = useMemo(() => (eslabones ?? []).map(e => e.tipo_evento), [eslabones]);
  const nombres = useMemo(() => Object.fromEntries(evaluaciones.map(e => [e.control.codigo_iso, e.control.nombre])), [evaluaciones]);
  const fechaCierre = cerrada && inf ? inf.fecha_generacion.slice(0, 10) : null;
  const cifra = cerrada && inf ? pct(Number(inf.cumplimiento_pct)) : null;
  const selloPlano = <Sello eslabones={eslabones ?? []} verificacion={cerrada && v ? v : null} cifra={cifra} fechaCierre={fechaCierre} idNuevo={idNuevo} />;

  return (
    <div className="pila">
    <div className={`acta${apta || cerrada ? ' apta' : ''}`} ref={acta} data-estado={auditoria.estado} style={{ '--n': evaluaciones.length } as React.CSSProperties}>
      <div className="hoja">
        <header className="hoja-cab">
          <div>
            <p className="sub num">Auditoría n.º {auditoria.id} · ISO/IEC 27002:2022</p>
            <h1 className="hoja-titulo">{auditoria.organizacion}</h1>
            <p className="hoja-alcance">{auditoria.alcance}</p>
            <p className="hoja-datos num"><span>{fecha(auditoria.fecha_inicio)} – {fecha(auditoria.fecha_fin)}</span><span>{auditoria.auditor_nombre}</span></p>
          </div>
          <Estados estado={auditoria.estado} />
        </header>

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

        <footer className={`hoja-pie${sellada ? ' sellada' : ''}`}>
          <div className="pie-txt">
            {!sellada ? (
              <div>
                <p className="num"><b>{completas} de {evaluaciones.length} trazas completas</b>{eslabones && <> · {plural(eslabones.length, 'eslabón', 'eslabones')} en la bitácora</>}</p>
                {traz.isError ? <MensajeError>{traz.error.message}</MensajeError>
                  : !traz.data ? <p className="sub">{cerrada ? 'Fijando la hoja…' : 'Consultando la trazabilidad…'}</p>
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
            ) : (
              <div>
                {integ.isError ? <MensajeError>{integ.error.message}</MensajeError> : !v ? <p className="sub">Verificando la integridad…</p> : (
                  <>
                    <p ref={resultado} className="entra" role="status">
                      {v.integra ? (
                        <><b>{inf ? `Cerrada el ${fecha(inf.fecha_generacion)} a las ${hora(inf.fecha_generacion)}.` : 'Cerrada.'}</b>{inf && ` Cumplimiento del ${pct(Number(inf.cumplimiento_pct))}.`} Cadena íntegra: {v.cadena.eslabones_verificados} de {v.cadena.total_eslabones} eslabones verificados.</>
                      ) : v.cadena.ruptura ? (
                        <><b>No íntegra.</b> La cadena se rompe en el eslabón {v.cadena.ruptura.posicion} de {v.cadena.total_eslabones} ({v.cadena.ruptura.motivo}): se esperaba {v.cadena.ruptura.esperado} y se encontró {v.cadena.ruptura.encontrado}. Solo se verificaron {v.cadena.eslabones_verificados} eslabones.</>
                      ) : (
                        <><b>No íntegra.</b> La cadena es válida, pero el informe no supera todas las comprobaciones.</>
                      )}
                    </p>
                    <p className="hash sub">hash_final {v.hash_final}</p>
                    <dl className="checks">
                      <dt>La cadena es válida</dt><dd className={v.cadena.valida ? '' : 'no'}>{v.cadena.valida ? 'Sí' : 'No'}</dd>
                      {v.informe && Object.entries(v.informe.checks).map(([k, ok]) => <FilaCheck key={k} nombre={NOMBRE_CHECK[k] ?? k} ok={ok} />)}
                    </dl>
                    <div className="fila-acc">
                      <Link className="btn" to={`/auditorias/${id}/informe`}>Imprimir informe</Link>
                      <button className="btn sec" type="button" onClick={() => void verificar()} disabled={verificando}>{verificando ? 'Verificando…' : 'Verificar integridad'}</button>
                      <Link className="enlace" to="/auditorias">Volver a las auditorías</Link>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {sellada && v && inf
            ? <SelloRelieve tipos={tipos} hashFinal={v.hash_final} cifra={cifra ?? ''} orla={textoOrla(v, fechaCierre)} ruptura={v.integra ? null : v.cadena.ruptura?.posicion ?? null} pulso={recompuesto}>{selloPlano}</SelloRelieve>
            : selloPlano}
        </footer>
      </div>
    </div>
    {sellada && eslabones && inf && (
      <>
        <Historia eslabones={eslabones} nombres={nombres} titulo={`Historia de la auditoría n.º ${auditoria.id}`} cifra={cifra ?? ''} orla={v ? textoOrla(v, fechaCierre) : ''} />
        <Postura evaluaciones={evaluaciones} />
      </>
    )}
    </div>
  );
}

function FilaCheck({ nombre, ok }: { nombre: string; ok: boolean }) {
  return <><dt>{nombre}</dt><dd className={ok ? '' : 'no'}>{ok ? 'Sí' : 'No'}</dd></>;
}
