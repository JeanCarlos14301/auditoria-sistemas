import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCrearAuditoria } from '../api/queries';
import { Campo, Estados, MensajeError, conError } from '../components/basicos';
import { sacudir } from '../motion/efectos';

type Errores = Partial<Record<'organizacion' | 'alcance' | 'fecha_inicio' | 'fecha_fin', string>>;

/**
 * Crear una auditoría es abrir una hoja en blanco: el nombre de la organización se escribe donde luego irá el título.
 * Validación en el cliente (RNF03, CP-02): si falta un dato o las fechas están invertidas, no se envía la petición.
 */
export default function NuevaAuditoria() {
  const ir = useNavigate();
  const m = useCrearAuditoria();
  const [organizacion, setOrganizacion] = useState('');
  const [alcance, setAlcance] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [local, setLocal] = useState<Errores>({});
  const form = useRef<HTMLFormElement>(null);
  const err: Errores = { ...(m.error?.porCampo ?? {}), ...local };
  const al = <T,>(campo: keyof Errores, set: (v: T) => void) => (v: T) => { set(v); if (local[campo]) setLocal(({ [campo]: _, ...resto }) => resto); };

  useEffect(() => { if (m.error) sacudir(form.current); }, [m.error]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const faltan: Errores = {};
    if (!organizacion.trim()) faltan.organizacion = 'Escribe el nombre de la organización.';
    if (!alcance.trim()) faltan.alcance = 'Describe el alcance de la auditoría.';
    if (!inicio) faltan.fecha_inicio = 'Elige la fecha de inicio.';
    if (!fin) faltan.fecha_fin = 'Elige la fecha de fin.';
    else if (inicio && fin < inicio) faltan.fecha_fin = 'La fecha de fin no puede ser anterior a la de inicio.';
    setLocal(faltan);
    if (Object.keys(faltan).length) { sacudir(form.current); return; }
    m.mutate({ organizacion: organizacion.trim(), alcance: alcance.trim(), fecha_inicio: inicio, fecha_fin: fin }, {
      // La hoja recién creada se abre en su alcance; `recien` le dice que haga la entrada completa
      onSuccess: a => ir(`/auditorias/${a.id}`, { replace: true, state: { recien: true } }),
    });
  };

  return (
    <div className="acta">
      <div className="hoja">
        <header className="hoja-cab">
          <div>
            <p className="sub num">Nueva auditoría · ISO/IEC 27002:2022</p>
            <form className="nv-form" ref={form} onSubmit={enviar} noValidate>
              <Campo id="nv-org" etiqueta="Organización" error={err.organizacion}><input className="titulo-input" type="text" placeholder="Nombre de la organización" autoFocus value={organizacion} onChange={e => al('organizacion', setOrganizacion)(e.target.value)} {...conError('nv-org', err.organizacion)} /></Campo>
              <Campo id="nv-alc" etiqueta="Alcance" error={err.alcance}><textarea className="campo" value={alcance} onChange={e => al('alcance', setAlcance)(e.target.value)} {...conError('nv-alc', err.alcance)} /></Campo>
              <div className="dos">
                <Campo id="nv-ini" etiqueta="Fecha de inicio" error={err.fecha_inicio}><input className="campo" type="date" value={inicio} onChange={e => al('fecha_inicio', setInicio)(e.target.value)} {...conError('nv-ini', err.fecha_inicio)} /></Campo>
                <Campo id="nv-fin" etiqueta="Fecha de fin" error={err.fecha_fin}><input className="campo" type="date" value={fin} onChange={e => al('fecha_fin', setFin)(e.target.value)} {...conError('nv-fin', err.fecha_fin)} /></Campo>
              </div>
              {m.isError && !Object.keys(m.error.porCampo).length && <MensajeError>{m.error.message}</MensajeError>}
              <div className="fila-acc">
                <button className="btn" type="submit" disabled={m.isPending}>{m.isPending ? 'Creando…' : 'Crear auditoría'}</button>
                <Link className="enlace" to="/auditorias">Cancelar</Link>
                {Object.keys(local).length > 0 && <p className="aviso entra" role="status">No se ha enviado: revisa los campos marcados.</p>}
              </div>
            </form>
          </div>
          <div className="estados-sin"><Estados estado="BORRADOR" /></div>
        </header>
      </div>
    </div>
  );
}
