import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuditorias } from '../api/queries';
import type { AuditoriaListado, EstadoAuditoria } from '../api/types';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { ESTADOS_AUDITORIA, NOMBRE_ESTADO, fecha, pct, plural } from '../lib/format';
import { CountUp } from '../motion/CountUp';
import { cascada, moverIndicador } from '../motion/efectos';
import { CURVA, Flip, gsap } from '../motion/gsap';
import { prefersReducedMotion } from '../motion/motion';

type Filtro = 'TODAS' | EstadoAuditoria;
type Orden = 'reciente' | 'pct' | 'az';
/** Por urgencia: primero lo que está a punto de cerrarse. */
const ORDEN_ESTADOS: readonly EstadoAuditoria[] = ['EN_REVISION', 'EN_EJECUCION', 'BORRADOR', 'CERRADA'];
const FILTROS: readonly [Filtro, string][] = [['TODAS', 'Todas'], ['EN_REVISION', 'En revisión'], ['EN_EJECUCION', 'En ejecución'], ['BORRADOR', 'Borrador'], ['CERRADA', 'Cerradas']];
const GRUPO: Record<EstadoAuditoria, [string, string]> = {
  EN_REVISION: ['En revisión', 'Revisar las trazas y cerrar'], EN_EJECUCION: ['En ejecución', 'Evaluar los controles'],
  BORRADOR: ['Borrador', 'Definir el alcance'], CERRADA: ['Cerradas', 'Actas selladas'],
};
/** El siguiente paso de cada auditoría según su estado, y a qué vista lleva. */
const ACCION: Record<EstadoAuditoria, [string, string]> = {
  BORRADOR: ['Definir el alcance', ''], EN_EJECUCION: ['Seguir evaluando', ''], EN_REVISION: ['Revisar y cerrar', '/cierre'], CERRADA: ['Ver el acta', '/cierre'],
};
const ORDENES: readonly [Orden, string][] = [['reciente', 'Más recientes'], ['pct', 'Mayor cumplimiento'], ['az', 'A–Z']];

export default function Auditorias() {
  const q = useAuditorias();
  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  return <Indice auditorias={q.data} />;
}

/** Sin tildes ni mayúsculas, para buscar como se escribe. */
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Resalta la coincidencia con la búsqueda. */
function Resaltado({ texto, q }: { texto: string; q: string }): ReactNode {
  const i = q ? normal(texto).indexOf(normal(q)) : -1;
  if (i < 0) return texto;
  return <>{texto.slice(0, i)}<mark>{texto.slice(i, i + q.length)}</mark>{texto.slice(i + q.length)}</>;
}

/**
 * El índice de auditorías. Los filtros son a la vez el resumen: cuántas hay en cada estado.
 * Con «Todas», se agrupan por lo que toca hacer y cada fila dice su siguiente paso.
 * Al filtrar, ordenar o buscar, las filas viajan a su nuevo sitio (GSAP Flip).
 */
function Indice({ auditorias }: { auditorias: AuditoriaListado[] }) {
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [orden, setOrden] = useState<Orden>('reciente');
  const [texto, setTexto] = useState(''), [busca, setBusca] = useState('');
  const [visto, setVisto] = useState(false);
  const raiz = useRef<HTMLElement>(null), gFiltro = useRef<HTMLDivElement>(null), gOrden = useRef<HTMLDivElement>(null), lista = useRef<HTMLDivElement>(null);
  const antes = useRef<Flip.FlipState | null>(null);

  const cuenta = useMemo(() => {
    const c: Record<Filtro, number> = { TODAS: auditorias.length, BORRADOR: 0, EN_EJECUCION: 0, EN_REVISION: 0, CERRADA: 0 };
    auditorias.forEach(a => { c[a.estado]++; });
    return c;
  }, [auditorias]);
  // La API las entrega de la más reciente a la más antigua
  const filas = useMemo(() => {
    let l = auditorias.filter(a => (filtro === 'TODAS' || a.estado === filtro) && (!busca || normal(`${a.organizacion} ${a.alcance}`).includes(normal(busca))));
    const valor = (a: AuditoriaListado) => (a.estado === 'BORRADOR' ? -1 : Number(a.cumplimiento_pct));
    if (orden === 'pct') l = [...l].sort((x, y) => valor(y) - valor(x));
    else if (orden === 'az') l = [...l].sort((x, y) => x.organizacion.localeCompare(y.organizacion, 'es'));
    return l;
  }, [auditorias, filtro, orden, busca]);
  const grupos: [EstadoAuditoria | null, AuditoriaListado[]][] = filtro === 'TODAS'
    ? ORDEN_ESTADOS.map((e): [EstadoAuditoria, AuditoriaListado[]] => [e, filas.filter(a => a.estado === e)]).filter(([, x]) => x.length > 0)
    : [[filtro, filas]];

  // Antes de que React recoloque las filas, se anota dónde está cada una
  const anotar = () => { if (lista.current && !prefersReducedMotion()) antes.current = Flip.getState(lista.current.querySelectorAll('.ls-f, .ls-g-cab')); };
  const filtrar = (f: Filtro) => { if (f !== filtro) { anotar(); setFiltro(f); } };
  const ordenar = (o: Orden) => { if (o !== orden) { anotar(); setOrden(o); } };
  useEffect(() => { const t = setTimeout(() => { if (texto.trim() !== busca) { anotar(); setBusca(texto.trim()); } }, 120); return () => clearTimeout(t); }, [texto, busca]);

  useLayoutEffect(() => {
    const conResorte = antes.current !== null;
    moverIndicador(gFiltro.current, conResorte, '[aria-pressed="true"]', '.lf-ind'); moverIndicador(gOrden.current, conResorte);
    const estado = antes.current, el = lista.current;
    antes.current = null;
    if (!estado || !el) return;
    const ctx = gsap.context(() => {
      Flip.from(estado, { targets: el.querySelectorAll('.ls-f, .ls-g-cab'), duration: 0.55, ease: CURVA.cambio, absoluteOnLeave: true,
        onEnter: els => gsap.fromTo(els, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: CURVA.entrada, clearProps: 'all' }),
        onLeave: els => gsap.to(els, { opacity: 0, duration: 0.25 }) });
    });
    return () => ctx.revert();
  }, [filtro, orden, busca]);

  // Al entrar: todo en cascada; después cada fila dibuja su paso por los estados y su línea de cumplimiento
  useEffect(() => {
    if (raiz.current) cascada(raiz.current.querySelectorAll('.ls-cab > *, .lf, .ls-herr > *, .ls-g-cab, .ls-f'), 30);
    const t = requestAnimationFrame(() => setVisto(true));
    const ro = new ResizeObserver(() => { moverIndicador(gFiltro.current, false, '[aria-pressed="true"]', '.lf-ind'); moverIndicador(gOrden.current, false); });
    if (gFiltro.current) ro.observe(gFiltro.current);
    return () => { cancelAnimationFrame(t); ro.disconnect(); };
  }, []);

  return (
    <section className={`ls${visto ? ' visto' : ''}`} ref={raiz}>
      <header className="ls-cab">
        <h1 className="ls-tit">Auditorías</h1>
        <Link className="btn" to="/auditorias/nueva">Nueva auditoría</Link>
      </header>
      {auditorias.length === 0 ? <p className="ls-vacio">Todavía no hay auditorías. Crea la primera con «Nueva auditoría».</p> : (
        <>
          {/* Los filtros son el resumen: cuántas auditorías hay en cada estado */}
          <div className="ls-filtros" ref={gFiltro} role="group" aria-label="Filtrar por estado">
            <span className="lf-ind" aria-hidden="true" />
            {FILTROS.map(([f, t]) => <button key={f} className="lf" type="button" aria-pressed={f === filtro} onClick={() => filtrar(f)}><b className="num">{cuenta[f]}</b><span>{t}</span></button>)}
          </div>
          <div className="ls-herr">
            <label className="ls-buscar"><span className="rot">Buscar</span><input type="search" placeholder="Organización o alcance" autoComplete="off" value={texto} onChange={e => setTexto(e.target.value)} /></label>
            <div className="chips" ref={gOrden} role="group" aria-label="Ordenar">
              <span className="chip-ind" aria-hidden="true" />
              {ORDENES.map(([o, t]) => <button key={o} className="chip" type="button" aria-pressed={o === orden} onClick={() => ordenar(o)}>{t}</button>)}
            </div>
          </div>
          <div className="ls-grupos" ref={lista}>
            {filas.length === 0 && <p className="ls-vacio">{busca ? `Ninguna auditoría coincide con «${busca}».` : 'Ninguna auditoría en este estado.'}</p>}
            {grupos.map(([e, x]) => (
              <section className="ls-g" key={e ?? 'todas'} aria-label={e ? GRUPO[e][0] : undefined}>
                {e && <header className="ls-g-cab" data-flip-id={`g${e}`}><h2>{GRUPO[e][0]}<span className="num">{x.length}</span></h2><p>{GRUPO[e][1]}</p></header>}
                <ol>{x.map(a => <Fila key={a.id} a={a} busca={busca} />)}</ol>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Fila({ a, busca }: { a: AuditoriaListado; busca: string }) {
  const paso = ESTADOS_AUDITORIA.indexOf(a.estado), sinAlcance = a.estado === 'BORRADOR', valor = Number(a.cumplimiento_pct);
  const [accion, ruta] = ACCION[a.estado];
  return (
    <li className="ls-f" data-flip-id={`a${a.id}`}>
      <Link className="ls-a" to={`/auditorias/${a.id}${ruta}`}>
        <span className="ls-id">
          <span className="org"><Resaltado texto={a.organizacion} q={busca} /></span>
          <span className="alc"><Resaltado texto={a.alcance} q={busca} /></span>
          <span className="meta num">n.º {a.id} · {fecha(a.fecha_inicio)} – {fecha(a.fecha_fin)} · {a.auditor_nombre}</span>
        </span>
        <span className="ls-est">
          <span className="mini" aria-hidden="true">{ESTADOS_AUDITORIA.map((e, k) => <i key={e} className={k <= paso ? 'on' : undefined} style={{ '--k': k } as React.CSSProperties} />)}</span>
          <span>{NOMBRE_ESTADO[a.estado]}{!sinAlcance && ` · ${plural(a.total_controles, 'control', 'controles')}`}</span>
        </span>
        <span className="ls-pct">
          {sinAlcance ? <span className="sin">Sin alcance</span> : (
            <Fragment>
              {/* Cuenta hasta el valor que envía la API y termina exactamente en él */}
              <CountUp className="num" valor={valor} desde={0} ms={1100} formato={pct} />
              <span className="linea"><i style={{ '--v': valor / 100 } as React.CSSProperties} /></span>
            </Fragment>
          )}
        </span>
        <span className="ls-acc">{accion}</span>
      </Link>
    </li>
  );
}
