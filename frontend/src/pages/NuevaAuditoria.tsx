import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCrearAuditoria, usePrecargarAuditoria } from '../api/queries';
import type { Auditoria } from '../api/types';
import { useSesion } from '../auth/AuthContext';
import { MensajeError } from '../components/basicos';
import { ESTADOS_AUDITORIA, NOMBRE_ESTADO, fecha, plural } from '../lib/format';
import { brincar, cascada, moverIndicador, sacudir } from '../motion/efectos';
import { prefersReducedMotion } from '../motion/motion';
import { medirViaje } from '../motion/viaje';

type Campo = 'organizacion' | 'alcance' | 'fecha_inicio' | 'fecha_fin';
type Errores = Partial<Record<Campo, string>>;
const MSG_INVERTIDAS = 'La fecha de fin no puede ser anterior a la de inicio.';

/**
 * La auditoría nueva se escribe donde irá su cabecera: el nombre en el sitio del título, el alcance y las fechas
 * debajo, y las cuatro fases esperando. Validación en el cliente (RNF03, CP-02): si falta un dato o las fechas
 * están invertidas, no se envía. Al crearla recibe su número, Borrador toma la fecha de la API y, con sus datos ya
 * en la caché, la hoja pasa al alcance: el título, el alcance, las fases y las pestañas viajan hasta la cabecera.
 */
export default function NuevaAuditoria() {
  const ir = useNavigate();
  const sesion = useSesion();
  const m = useCrearAuditoria();
  const precargar = usePrecargarAuditoria();
  const [organizacion, setOrganizacion] = useState('');
  const [alcance, setAlcance] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [local, setLocal] = useState<Errores>({});
  const [intentado, setIntentado] = useState(false);
  const [creada, setCreada] = useState<Auditoria | null>(null);
  const form = useRef<HTMLFormElement>(null), acc = useRef<HTMLDivElement>(null), area = useRef<HTMLTextAreaElement>(null), pest = useRef<HTMLDivElement>(null);
  const err: Errores = { ...(m.error?.porCampo ?? {}), ...local };
  const mal = (Object.keys(err) as Campo[]).filter(k => err[k]);
  const usuario = sesion.estado.fase === 'activa' ? sesion.estado.usuario.nombre : '';

  /** Al corregir un campo se retira su aviso. */
  const al = (campo: Campo, set: (v: string) => void) => (v: string) => { set(v); if (local[campo]) setLocal(({ [campo]: _, ...resto }) => resto); };
  // Las fechas avisan en cuanto se invierten; con las dos, se dice cuántos días dura
  useEffect(() => {
    if (inicio && fin && fin < inicio) setLocal(l => ({ ...l, fecha_fin: MSG_INVERTIDAS }));
    else setLocal(l => (l.fecha_fin === MSG_INVERTIDAS ? (({ fecha_fin: _, ...resto }) => resto)(l) : l));
  }, [inicio, fin]);
  const dias = inicio && fin && fin >= inicio ? Math.round((Date.parse(fin) - Date.parse(inicio)) / 864e5) + 1 : 0;
  // El alcance crece con lo que se escribe
  useLayoutEffect(() => { const t = area.current; if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; } }, [alcance]);
  useEffect(() => { if (m.error) sacudir(acc.current); }, [m.error]);
  // Al entrar: la hoja en cascada y las fases una tras otra
  useEffect(() => {
    const el = form.current; if (!el || prefersReducedMotion()) return;
    cascada(el.querySelectorAll('.nv-a > *'), 60);
    cascada(el.querySelectorAll('.fases .fase'), 90);
    cascada(el.querySelectorAll('.paso, .nv-acc'), 80);
  }, []);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (creada) return;
    const faltan: Errores = {};
    if (!organizacion.trim()) faltan.organizacion = 'Escribe el nombre de la organización.';
    if (!alcance.trim()) faltan.alcance = 'Describe el alcance de la auditoría.';
    if (!inicio) faltan.fecha_inicio = 'Elige la fecha de inicio.';
    if (!fin) faltan.fecha_fin = 'Elige la fecha de fin.';
    else if (inicio && fin < inicio) faltan.fecha_fin = MSG_INVERTIDAS;
    setLocal(faltan); setIntentado(true);
    const primero = (['organizacion', 'alcance', 'fecha_inicio', 'fecha_fin'] as const).find(k => faltan[k]);
    if (primero) { sacudir(acc.current); document.getElementById(`nv-${primero}`)?.focus(); return; }
    m.mutate({ organizacion: organizacion.trim(), alcance: alcance.trim(), fecha_inicio: inicio, fecha_fin: fin }, {
      onSuccess: async a => {
        // Creada: recibe su número y Borrador toma su fecha; mientras, se traen sus datos para abrirla sin esperas
        setCreada(a);
        const espera = new Promise(r => setTimeout(r, prefersReducedMotion() ? 300 : 1100));
        await Promise.all([precargar(a.id).catch(() => undefined), espera]);
        ir(`/auditorias/${a.id}`, { replace: true, state: { viaje: medirViaje(form.current) } });
      },
    });
  };
  useLayoutEffect(() => {
    if (!creada) return;
    moverIndicador(pest.current, false, '.pest', '.pest-ind');
    const el = form.current;
    brincar(el?.querySelector('.fase.actual i') ?? null, 0.2); brincar(el?.querySelector('.nid') ?? null, 0.8);
    if (el && !prefersReducedMotion()) cascada(el.querySelectorAll('.pestanas .pest'), 0, 8);
  }, [creada]);

  const campo = (k: Campo) => ({ id: `nv-${k}`, 'aria-invalid': err[k] ? true : undefined, 'aria-describedby': err[k] ? `nv-${k}-err` : undefined, readOnly: !!creada });
  const aviso = (k: Campo) => err[k] && <p className="campo-error" id={`nv-${k}-err`}>{err[k]}</p>;
  return (
    <form className={`nv${creada ? ' creada' : ''}`} ref={form} onSubmit={enviar} noValidate aria-label="Nueva auditoría">
      <div className="nv-cab">
        <div className="nv-a">
          <p className="rot" data-viaje="rot"><span className="nid" style={{ display: 'inline-block' }}>{creada ? `Auditoría n.º ${creada.id}` : 'Auditoría nueva'}</span> · ISO/IEC 27002:2022 · ISO 19011:2018</p>
          <div className="nv-campo-w">
            <div className={`nv-campo${err.organizacion ? ' mal' : ''}`}><label className="rot" htmlFor="nv-organizacion">Organización</label>
              <input className="nv-in nv-org" type="text" placeholder="Nombre de la organización" autoFocus autoComplete="organization" data-viaje="org" value={organizacion} onChange={e => al('organizacion', setOrganizacion)(e.target.value)} {...campo('organizacion')} /><i className="nv-linea" aria-hidden="true" /></div>
            {aviso('organizacion')}
          </div>
          <div className="nv-campo-w">
            <div className={`nv-campo${err.alcance ? ' mal' : ''}`}><label className="rot" htmlFor="nv-alcance">Alcance</label>
              <textarea className="nv-in nv-alc" rows={1} placeholder="Sistemas, sedes o procesos" ref={area} data-viaje="alc" value={alcance} onChange={e => al('alcance', setAlcance)(e.target.value)} {...campo('alcance')} /><i className="nv-linea" aria-hidden="true" /></div>
            {aviso('alcance')}
          </div>
          <div className="nv-fechas">
            <div className="nv-campo-w nv-f">
              <div className={`nv-campo${err.fecha_inicio ? ' mal' : ''}`}><label className="rot" htmlFor="nv-fecha_inicio">Inicio</label><input className="nv-in" type="date" value={inicio} onChange={e => al('fecha_inicio', setInicio)(e.target.value)} {...campo('fecha_inicio')} /><i className="nv-linea" aria-hidden="true" /></div>
              {aviso('fecha_inicio')}
            </div>
            <div className="nv-campo-w nv-f">
              <div className={`nv-campo${err.fecha_fin ? ' mal' : ''}`}><label className="rot" htmlFor="nv-fecha_fin">Fin</label><input className="nv-in" type="date" value={fin} onChange={e => al('fecha_fin', setFin)(e.target.value)} {...campo('fecha_fin')} /><i className="nv-linea" aria-hidden="true" /></div>
              {aviso('fecha_fin')}
            </div>
            <p className="nv-dur num" aria-live="polite">{dias ? plural(dias, 'día', 'días') : ''}</p>
          </div>
          <p className="nv-aud">Auditor: <b>{usuario}</b></p>
        </div>
        <ol className="fases" aria-label="Fases de la auditoría" data-viaje="fases">
          {ESTADOS_AUDITORIA.map((s, i) => (
            <li key={s} className={`fase${i === 0 ? (creada ? ' actual' : ' prox') : ''}`} aria-current={creada && i === 0 ? 'step' : undefined}>
              <i aria-hidden="true" /><b>{NOMBRE_ESTADO[s]}</b><span className="fecha num">{i === 0 ? (creada ? fecha(creada.creado_en) : 'al crearla') : ' '}</span>
            </li>
          ))}
        </ol>
        {creada && (
          <div className="pestanas-w">
            {/* Las mismas pestañas que tendrá la cabecera: viajan hasta ella */}
            <div className="pestanas" ref={pest} data-viaje="pest"><span className="pest-ind" aria-hidden="true" /><span className="pest" aria-current="page"><b>Alcance</b><small className="num">Elige de 10 a 15 controles</small></span></div>
          </div>
        )}
      </div>
      <section className="nv-pasos" aria-label="Lo que sigue">
        <div className="paso"><b>1</b><h3>Alcance</h3><p>Elegir entre 10 y 15 controles del catálogo ISO/IEC 27002:2022.</p></div>
        <div className="paso"><b>2</b><h3>Trabajo</h3><p>Evaluar cada control y registrar sus evidencias, hallazgos y recomendaciones.</p></div>
        <div className="paso"><b>3</b><h3>Revisión y cierre</h3><p>Completar la traza de cada control y sellar el acta. Después, solo lectura.</p></div>
      </section>
      <div className="nv-acc" ref={acc}>
        <button className="btn" type="submit" disabled={m.isPending || !!creada}>{m.isPending || creada ? 'Creando…' : 'Crear auditoría'}</button>
        <Link className="enlace" to="/auditorias">Cancelar</Link>
        {intentado && mal.length > 0 && !m.isError && <p className="falta" role="status">No se ha enviado: revisa los campos marcados.</p>}
        {m.isError && !Object.keys(m.error.porCampo).length && <MensajeError>{m.error.message}</MensajeError>}
      </div>
    </form>
  );
}
