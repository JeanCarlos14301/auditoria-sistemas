import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import type { ApiError } from '../api/client';
import { useCrearEvidencia, useCrearHallazgo, useCrearRecomendacion, useRefrescarAuditoria } from '../api/queries';
import type { FuenteEvidencia, Nivel } from '../api/types';
import { FUENTES, NIVELES, NOMBRE_FUENTE, NOMBRE_NIVEL, hoyISO } from '../lib/format';
import { cascada, sacudir } from '../motion/efectos';
import { CURVA, gsap } from '../motion/gsap';
import { prefersReducedMotion } from '../motion/motion';
import { Campo, MensajeError, conError } from './basicos';

interface Comun {
  idAuditoria: number;
  onHecho: () => void;
  onCancelar: () => void;
  /** Dónde está el eslabón que este formulario completa. Si se da, al guardar el formulario se pliega hacia él. */
  destino?: () => Element | null;
}

/**
 * Lo que pasa después de que la API acepta el registro: el formulario se pliega hacia el hueco de la traza,
 * se recargan los datos (y entonces aparece el eslabón) y se avisa a quien abrió el formulario.
 */
function useAlGuardar(idAuditoria: number, form: RefObject<HTMLFormElement>, destino: Comun['destino'], onHecho: () => void) {
  const recargar = useRefrescarAuditoria(idAuditoria);
  return useCallback(async () => {
    const el = form.current, hueco = destino?.() ?? null;
    if (el && hueco && !prefersReducedMotion()) {
      const h = hueco.getBoundingClientRect(), r = el.getBoundingClientRect();
      await new Promise<void>(fin => {
        gsap.to(el, { x: h.left + h.width / 2 - (r.left + r.width / 2), y: h.top + h.height / 2 - r.top, scale: 0.03, opacity: 0.3, transformOrigin: '50% 0', duration: 0.5, ease: 'power3.in', onComplete: fin });
      });
    }
    await recargar();
    onHecho();
  }, [recargar, form, destino, onHecho]);
}
type Errores = Record<string, string>;

function Marco({ refForm, titulo, onSubmit, onCancelar, enviando, error, enviar, children }: { refForm: RefObject<HTMLFormElement>; titulo: string; onSubmit: (e: FormEvent) => void; onCancelar: () => void; enviando: boolean; error: ApiError | null; enviar: string; children: ReactNode }) {
  // Se despliega desde la fila que lo abre y sus campos entran en cascada (solo transform y opacity)
  useLayoutEffect(() => {
    const el = refForm.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => { gsap.fromTo(el, { scaleY: 0.85, opacity: 0, y: -8 }, { scaleY: 1, opacity: 1, y: 0, duration: 0.45, ease: CURVA.entrada, clearProps: 'transform,opacity' }); });
    cascada(el.querySelectorAll('.campo-w, .fila-acc'), 35);
    return () => ctx.revert();
  }, [refForm]);
  // Un rechazo de la API sacude el formulario, igual que un campo vacío
  useEffect(() => { if (error) sacudir(refForm.current); }, [error, refForm]);
  return (
    <form className="subform" ref={refForm} onSubmit={onSubmit} noValidate aria-label={titulo}>
      <h4>{titulo}</h4>
      {children}
      {error && <MensajeError>{error.message}</MensajeError>}
      <div className="fila-acc">
        <button className="btn" type="submit" disabled={enviando}>{enviando ? 'Guardando…' : enviar}</button>
        <button className="enlace" type="button" onClick={onCancelar}>Cancelar</button>
      </div>
      <p className="nota">Una vez guardado no se puede editar ni borrar: la bitácora solo admite añadir.</p>
    </form>
  );
}

/** Devuelve el mensaje si el campo está vacío, o '' si tiene contenido. */
const requerido = (v: string, mensaje: string): string => (v.trim() ? '' : mensaje);
const limpiar = (e: Errores): Errores => Object.fromEntries(Object.entries(e).filter(([, v]) => v));

/** RF04: descripción, fuente, fecha de recolección y referencia del archivo. */
export function FormEvidencia({ idAuditoria, idEvaluacion, onHecho, onCancelar, destino }: Comun & { idEvaluacion: number }) {
  const uid = useId();
  const refForm = useRef<HTMLFormElement>(null);
  const alGuardar = useAlGuardar(idAuditoria, refForm, destino, onHecho);
  const m = useCrearEvidencia(idAuditoria);
  const [descripcion, setDescripcion] = useState('');
  const [fuente, setFuente] = useState<FuenteEvidencia>('DOCUMENTAL');
  const [fechaRec, setFechaRec] = useState(hoyISO);
  const [referencia, setReferencia] = useState('');
  const [local, setLocal] = useState<Errores>({});
  const err = { ...(m.error?.porCampo ?? {}), ...local };
  /** Al corregir un campo se retira su aviso: el error no se queda pegado a algo que ya está bien. */
  const al = <T,>(campo: string, set: (v: T) => void) => (v: T) => { set(v); if (local[campo]) setLocal(({ [campo]: _, ...resto }) => resto); };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const faltan = limpiar({ descripcion: requerido(descripcion, 'La descripción es obligatoria.') });
    setLocal(faltan);
    if (Object.keys(faltan).length) sacudir(refForm.current);
    if (Object.keys(faltan).length) return;   // validación en el cliente (RNF03): no se envía la petición
    m.mutate({ idEvaluacion, body: { descripcion: descripcion.trim(), fuente, fecha_recoleccion: fechaRec || undefined, referencia_archivo: referencia.trim() || null } }, { onSuccess: () => { void alGuardar(); } });
  };
  return (
    <Marco refForm={refForm} titulo="Registrar evidencia" onSubmit={enviar} onCancelar={onCancelar} enviando={m.isPending} error={m.error} enviar="Guardar evidencia">
      <Campo id={`${uid}d`} etiqueta="Descripción" error={err.descripcion}><textarea className="campo" autoFocus value={descripcion} onChange={e => al('descripcion', setDescripcion)(e.target.value)} {...conError(`${uid}d`, err.descripcion)} /></Campo>
      <div className="dos">
        <Campo id={`${uid}f`} etiqueta="Fuente" error={err.fuente}><select className="campo" value={fuente} onChange={e => setFuente(e.target.value as FuenteEvidencia)} {...conError(`${uid}f`, err.fuente)}>{FUENTES.map(f => <option key={f} value={f}>{NOMBRE_FUENTE[f]}</option>)}</select></Campo>
        <Campo id={`${uid}r`} etiqueta="Fecha de recolección" error={err.fecha_recoleccion}><input className="campo" type="date" value={fechaRec} onChange={e => setFechaRec(e.target.value)} {...conError(`${uid}r`, err.fecha_recoleccion)} /></Campo>
      </div>
      <Campo id={`${uid}a`} etiqueta="Referencia del archivo" nota="ruta o URL, opcional" error={err.referencia_archivo}><input className="campo" type="text" maxLength={500} value={referencia} onChange={e => setReferencia(e.target.value)} {...conError(`${uid}a`, err.referencia_archivo)} /></Campo>
    </Marco>
  );
}

/** RF05: condición, criterio (del catálogo), causa, efecto y severidad. */
export function FormHallazgo({ idAuditoria, idEvaluacion, criterio, onHecho, onCancelar, destino }: Comun & { idEvaluacion: number; criterio: string }) {
  const uid = useId();
  const refForm = useRef<HTMLFormElement>(null);
  const alGuardar = useAlGuardar(idAuditoria, refForm, destino, onHecho);
  const m = useCrearHallazgo(idAuditoria);
  const [condicion, setCondicion] = useState('');
  const [causa, setCausa] = useState('');
  const [efecto, setEfecto] = useState('');
  const [severidad, setSeveridad] = useState<Nivel | ''>('');
  const [local, setLocal] = useState<Errores>({});
  const err = { ...(m.error?.porCampo ?? {}), ...local };
  /** Al corregir un campo se retira su aviso: el error no se queda pegado a algo que ya está bien. */
  const al = <T,>(campo: string, set: (v: T) => void) => (v: T) => { set(v); if (local[campo]) setLocal(({ [campo]: _, ...resto }) => resto); };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const faltan = limpiar({ condicion: requerido(condicion, 'La condición es obligatoria.'), causa: requerido(causa, 'La causa es obligatoria.'), efecto_riesgo: requerido(efecto, 'El efecto o riesgo es obligatorio.'), severidad: severidad ? '' : 'Elige una severidad.' });
    setLocal(faltan);
    if (Object.keys(faltan).length) sacudir(refForm.current);
    if (Object.keys(faltan).length || !severidad) return;
    // El criterio no se envía: la API lo completa con el del control (ISO 19011).
    m.mutate({ idEvaluacion, body: { condicion: condicion.trim(), causa: causa.trim(), efecto_riesgo: efecto.trim(), severidad } }, { onSuccess: () => { void alGuardar(); } });
  };
  return (
    <Marco refForm={refForm} titulo="Registrar hallazgo" onSubmit={enviar} onCancelar={onCancelar} enviando={m.isPending} error={m.error} enviar="Guardar hallazgo">
      <Campo id={`${uid}c`} etiqueta="Condición" nota="qué se encontró" error={err.condicion}><textarea className="campo" autoFocus value={condicion} onChange={e => al('condicion', setCondicion)(e.target.value)} {...conError(`${uid}c`, err.condicion)} /></Campo>
      <div className="campo-w"><p className="etq">Criterio <small>lo toma la API del catálogo</small></p><p className="cita">{criterio}</p></div>
      <Campo id={`${uid}u`} etiqueta="Causa" nota="por qué ocurre" error={err.causa}><textarea className="campo" value={causa} onChange={e => al('causa', setCausa)(e.target.value)} {...conError(`${uid}u`, err.causa)} /></Campo>
      <Campo id={`${uid}e`} etiqueta="Efecto o riesgo" error={err.efecto_riesgo}><textarea className="campo" value={efecto} onChange={e => al('efecto_riesgo', setEfecto)(e.target.value)} {...conError(`${uid}e`, err.efecto_riesgo)} /></Campo>
      <Campo id={`${uid}s`} etiqueta="Severidad" error={err.severidad}><select className="campo" value={severidad} onChange={e => al('severidad', setSeveridad)(e.target.value as Nivel | '')} {...conError(`${uid}s`, err.severidad)}><option value="">Elige…</option>{NIVELES.map(n => <option key={n} value={n}>{NOMBRE_NIVEL[n]}</option>)}</select></Campo>
    </Marco>
  );
}

/** RF06: descripción, prioridad y plazo. */
export function FormRecomendacion({ idAuditoria, idHallazgo, onHecho, onCancelar, destino }: Comun & { idHallazgo: number }) {
  const uid = useId();
  const refForm = useRef<HTMLFormElement>(null);
  const alGuardar = useAlGuardar(idAuditoria, refForm, destino, onHecho);
  const m = useCrearRecomendacion(idAuditoria);
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState<Nivel | ''>('');
  const [plazo, setPlazo] = useState('');
  const [local, setLocal] = useState<Errores>({});
  const err = { ...(m.error?.porCampo ?? {}), ...local };
  /** Al corregir un campo se retira su aviso: el error no se queda pegado a algo que ya está bien. */
  const al = <T,>(campo: string, set: (v: T) => void) => (v: T) => { set(v); if (local[campo]) setLocal(({ [campo]: _, ...resto }) => resto); };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const faltan = limpiar({ descripcion: requerido(descripcion, 'La descripción es obligatoria.'), prioridad: prioridad ? '' : 'Elige una prioridad.', plazo_estimado: requerido(plazo, 'El plazo es obligatorio.') });
    setLocal(faltan);
    if (Object.keys(faltan).length) sacudir(refForm.current);
    if (Object.keys(faltan).length || !prioridad) return;
    m.mutate({ idHallazgo, body: { descripcion: descripcion.trim(), prioridad, plazo_estimado: plazo.trim() } }, { onSuccess: () => { void alGuardar(); } });
  };
  return (
    <Marco refForm={refForm} titulo="Registrar recomendación" onSubmit={enviar} onCancelar={onCancelar} enviando={m.isPending} error={m.error} enviar="Guardar recomendación">
      <Campo id={`${uid}d`} etiqueta="Descripción" error={err.descripcion}><textarea className="campo" autoFocus value={descripcion} onChange={e => al('descripcion', setDescripcion)(e.target.value)} {...conError(`${uid}d`, err.descripcion)} /></Campo>
      <div className="dos">
        <Campo id={`${uid}p`} etiqueta="Prioridad" error={err.prioridad}><select className="campo" value={prioridad} onChange={e => al('prioridad', setPrioridad)(e.target.value as Nivel | '')} {...conError(`${uid}p`, err.prioridad)}><option value="">Elige…</option>{NIVELES.map(n => <option key={n} value={n}>{NOMBRE_NIVEL[n]}</option>)}</select></Campo>
        <Campo id={`${uid}z`} etiqueta="Plazo estimado" nota="por ejemplo, 90 días" error={err.plazo_estimado}><input className="campo" type="text" maxLength={80} value={plazo} onChange={e => al('plazo_estimado', setPlazo)(e.target.value)} {...conError(`${uid}z`, err.plazo_estimado)} /></Campo>
      </div>
    </Marco>
  );
}
