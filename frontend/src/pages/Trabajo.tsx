import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuditoria, useCambiarEstado, useEvaluar } from '../api/queries';
import type { AuditoriaDetalle, EstadoEvaluacion, Evaluacion, ResumenMetricas } from '../api/types';
import { Campo, Estados, Marca, MensajeError, conError } from '../components/basicos';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { Postura } from '../components/Postura';
import { FormEvidencia, FormHallazgo, FormRecomendacion } from '../components/Formularios';
import { ESTADOS_EVALUACION, MIN_TEXTO_EVALUACION, MSG_CP04, MSG_CP05, NOMBRE_ESTADO, NOMBRE_EVALUACION, NOMBRE_FUENTE, NOMBRE_NIVEL, fecha, hora, pct } from '../lib/format';
import { CountUp } from '../motion/CountUp';
import { cascada, sacudir } from '../motion/efectos';
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
  if (estado === 'BORRADOR') return <Alcance id={id} datos={q.data} />;
  return <Vista id={id} datos={q.data} />;
}

/** Recién creada por el alcance: "No implementado" sin observaciones, un estado que la API no deja guardar (CP-04). */
const sinEvaluar = (e: Evaluacion): boolean => e.estado === 'NO_IMPLEMENTADO' && !e.observaciones;

function Vista({ id, datos }: { id: number; datos: AuditoriaDetalle }) {
  const { auditoria, evaluaciones, metricas } = datos;
  const [sel, setSel] = useState<number>(() => (evaluaciones.find(sinEvaluar) ?? evaluaciones[0])!.id);
  const actual = evaluaciones.find(e => e.id === sel) ?? evaluaciones[0]!;
  const cambiar = useCambiarEstado(id);
  const destino = auditoria.estado === 'EN_EJECUCION' ? 'EN_REVISION' : 'EN_EJECUCION';
  const lista = useRef<HTMLElement>(null);
  // Al entrar, los controles aparecen en cascada
  useEffect(() => { if (lista.current) cascada(lista.current.querySelectorAll('.wk-item'), 35); }, []);

  return (
    <div className="pila">
    <div className="wk">
      <header className="wk-cab">
        <div>
          <h1 className="wk-org">{auditoria.organizacion}</h1>
          <p className="wk-meta num">{fecha(auditoria.fecha_inicio)} – {fecha(auditoria.fecha_fin)} · {auditoria.auditor_nombre}</p>
        </div>
        <Estados estado={auditoria.estado} />
        <div className="wk-acc">
          <div className="fila-acc">
            <button className="btn sec" type="button" disabled={cambiar.isPending} onClick={() => cambiar.mutate(destino)}>{destino === 'EN_REVISION' ? 'Pasar a revisión' : 'Volver a ejecución'}</button>
            <Link className="btn" to={`/auditorias/${id}/cierre`}>Revisar y cerrar</Link>
          </div>
          {cambiar.isError ? <MensajeError>{cambiar.error.message}</MensajeError>
            : cambiar.isSuccess && <p className="aviso entra" role="status">Estado actualizado: {NOMBRE_ESTADO[cambiar.data.auditoria.estado]}.</p>}
        </div>
      </header>
      <div className="wk-cuerpo">
        <nav className="wk-lista" ref={lista} aria-label="Controles del alcance">
          {evaluaciones.map(e => (
            <button key={e.id} type="button" className={`wk-item${sinEvaluar(e) ? ' pend' : ''}`} aria-current={e.id === actual.id} onClick={() => setSel(e.id)}>
              <Marca estado={e.estado} /><span className="cod">{e.control.codigo_iso}</span><span className="nom">{e.control.nombre}</span>
            </button>
          ))}
        </nav>
        <select className="campo wk-select" aria-label="Control" value={actual.id} onChange={e => setSel(Number(e.target.value))}>
          {evaluaciones.map(e => <option key={e.id} value={e.id}>{e.control.codigo_iso} · {e.control.nombre}{sinEvaluar(e) ? ' (pendiente)' : ''}</option>)}
        </select>
        {/* key: al cambiar de control el detalle se monta de nuevo, con sus formularios en blanco y su entrada */}
        <Detalle key={actual.id} idAuditoria={id} ev={actual} />
        <Metricas m={metricas} evaluaciones={evaluaciones} />
      </div>
    </div>
    <Postura evaluaciones={evaluaciones} />
    </div>
  );
}

function Detalle({ idAuditoria, ev }: { idAuditoria: number; ev: Evaluacion }) {
  const c = ev.control;
  const [abierto, setAbierto] = useState<'evidencia' | 'hallazgo' | { recomendacionDe: number } | null>(null);
  const cerrar = () => setAbierto(null);
  return (
    <section className="wk-det entra" aria-label={`Control ${c.codigo_iso}`}>
      <header><p className="cod num">{c.codigo_iso}</p><h2>{c.nombre}</h2><p className="sub">Cláusula {c.clausula} · {c.categoria_tema}</p></header>
      <p className="criterio">{c.criterio_evaluacion}</p>
      <FormEvaluacion idAuditoria={idAuditoria} ev={ev} />

      <div className="wk-sec">
        <div className="wk-sec-cab"><h3>Evidencias</h3>{abierto !== 'evidencia' && <button className="btn sec min" type="button" onClick={() => setAbierto('evidencia')}>Registrar evidencia</button>}</div>
        {abierto === 'evidencia' && <FormEvidencia idAuditoria={idAuditoria} idEvaluacion={ev.id} onHecho={cerrar} onCancelar={cerrar} />}
        {ev.evidencias.length ? (
          <ul className="reg">{ev.evidencias.map(v => (
            <li key={v.id}><span>{v.descripcion}</span><span className="meta num">{NOMBRE_FUENTE[v.fuente]} · {fecha(v.fecha_recoleccion)} · {v.referencia_archivo ?? 'sin archivo'}</span>{v.checksum_sha256 && <span className="hash sub">sha256 {v.checksum_sha256}</span>}</li>
          ))}</ul>
        ) : <p className="sub">Sin evidencias registradas.</p>}
      </div>

      <div className="wk-sec">
        <div className="wk-sec-cab"><h3>Hallazgos</h3>{abierto !== 'hallazgo' && <button className="btn sec min" type="button" onClick={() => setAbierto('hallazgo')}>Registrar hallazgo</button>}</div>
        {abierto === 'hallazgo' && <FormHallazgo idAuditoria={idAuditoria} idEvaluacion={ev.id} criterio={c.criterio_evaluacion} onHecho={cerrar} onCancelar={cerrar} />}
        {ev.hallazgos.length ? (
          <ul className="reg">{ev.hallazgos.map(h => {
            const formAbierto = typeof abierto === 'object' && abierto?.recomendacionDe === h.id;
            return (
              <li key={h.id}>
                <span>{h.condicion}</span>
                <span className="meta">Severidad {NOMBRE_NIVEL[h.severidad].toLowerCase()} · Causa: {h.causa}</span>
                <span className="meta">Efecto: {h.efecto_riesgo}</span>
                {h.recomendaciones.map(r => <span className="meta" key={r.id}>Recomendación: {r.descripcion} Prioridad {NOMBRE_NIVEL[r.prioridad].toLowerCase()}, plazo {r.plazo_estimado}.</span>)}
                {h.recomendaciones.length === 0 && !formAbierto && <span className="meta falta">Sin recomendación: el cierre quedará bloqueado.</span>}
                {formAbierto ? <FormRecomendacion idAuditoria={idAuditoria} idHallazgo={h.id} onHecho={cerrar} onCancelar={cerrar} />
                  : <span><button className="btn sec min" type="button" onClick={() => setAbierto({ recomendacionDe: h.id })}>Registrar recomendación</button></span>}
              </li>
            );
          })}</ul>
        ) : <p className="sub">Sin hallazgos registrados.</p>}
      </div>
    </section>
  );
}

function FormEvaluacion({ idAuditoria, ev }: { idAuditoria: number; ev: Evaluacion }) {
  const m = useEvaluar(idAuditoria);
  const [estado, setEstado] = useState<EstadoEvaluacion>(ev.estado);
  const [obs, setObs] = useState(ev.observaciones ?? '');
  const [na, setNa] = useState(ev.justificacion_na ?? '');
  const [local, setLocal] = useState<{ campo: 'obs' | 'na'; msg: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (local || m.isError) sacudir(form.current); }, [local, m.isError]);
  const i = ESTADOS_EVALUACION.indexOf(estado);
  const pideObs = estado === 'PARCIALMENTE_IMPLEMENTADO' || estado === 'NO_IMPLEMENTADO';
  const pideNa = estado === 'NO_APLICABLE';
  const error = local?.msg ?? (m.isError ? m.error.message : null);
  const errObs = local?.campo === 'obs' || (m.isError && pideObs) ? 'obs' : undefined;
  const errNa = local?.campo === 'na' || (m.isError && pideNa) ? 'na' : undefined;

  const elegir = (v: EstadoEvaluacion) => { setEstado(v); setLocal(null); m.reset(); };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    // Validación en el cliente (RNF03) con el mismo mensaje que la API; el servidor valida igualmente.
    if (pideObs && obs.trim().length < MIN_TEXTO_EVALUACION) { setLocal({ campo: 'obs', msg: MSG_CP04 }); document.getElementById('ev-obs')?.focus(); return; }
    if (pideNa && na.trim().length < MIN_TEXTO_EVALUACION) { setLocal({ campo: 'na', msg: MSG_CP05 }); document.getElementById('ev-na')?.focus(); return; }
    setLocal(null);
    m.mutate({ idEvaluacion: ev.id, body: { estado, observaciones: obs.trim() || null, justificacion_na: pideNa ? na.trim() : null } });
  };

  return (
    <form className="wk-form" ref={form} onSubmit={enviar} noValidate>
      <fieldset>
        <legend>Estado de la evaluación</legend>
        <div className="seg" style={{ '--i': i, '--c': i % 2, '--f': i >> 1 } as React.CSSProperties}>
          <span className="seg-ind" />
          {ESTADOS_EVALUACION.map(v => (
            <label key={v}><input type="radio" name="estado" value={v} checked={v === estado} onChange={() => elegir(v)} /><span>{NOMBRE_EVALUACION[v]}</span></label>
          ))}
        </div>
      </fieldset>
      {!pideNa && (
        <Campo id="ev-obs" etiqueta="Observaciones" nota={pideObs ? 'obligatorias' : 'opcionales'}>
          <textarea className="campo" value={obs} onChange={e => { setObs(e.target.value); setLocal(null); }} {...conError('ev-obs', errObs)} aria-describedby={error ? 'ev-error' : undefined} />
        </Campo>
      )}
      {pideNa && (
        <Campo id="ev-na" etiqueta="Justificación de la exclusión" nota="obligatoria">
          <textarea className="campo" value={na} onChange={e => { setNa(e.target.value); setLocal(null); }} {...conError('ev-na', errNa)} aria-describedby={error ? 'ev-error' : undefined} />
        </Campo>
      )}
      {error && <MensajeError id="ev-error">{error}</MensajeError>}
      <div className="fila-acc">
        <button className="btn" type="submit" disabled={m.isPending}>{m.isPending ? 'Guardando…' : 'Guardar evaluación'}</button>
        {m.isSuccess && !local && <p className="aviso entra" role="status">Guardado a las {hora(m.data.evaluado_en)}.</p>}
      </div>
    </form>
  );
}

function Metricas({ m, evaluaciones }: { m: ResumenMetricas; evaluaciones: Evaluacion[] }) {
  return (
    <aside className="wk-met" aria-label="Métricas">
      <div>
        <p className="sub">Cumplimiento</p>
        {/* El valor es el de la API; la cuenta solo anima el paso del anterior al nuevo y termina exactamente en él. */}
        <p className="cifra num"><CountUp valor={m.cumplimiento_pct} formato={pct} /></p>
        <p className="sub num">{m.implementados} implementados de {m.total_aplicables} aplicables</p>
      </div>
      <div className="unidades">{evaluaciones.map(e => <Marca key={e.id} estado={e.estado} titulo={`${e.control.codigo_iso} ${NOMBRE_EVALUACION[e.estado]}`} />)}</div>
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
    </aside>
  );
}
