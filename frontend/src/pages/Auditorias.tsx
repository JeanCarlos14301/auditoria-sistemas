import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
type Orden = 'reciente' | 'pct';
const FILTROS: readonly [Filtro, string][] = [['TODAS', 'Todas'], ['BORRADOR', 'Borrador'], ['EN_EJECUCION', 'En ejecución'], ['EN_REVISION', 'En revisión'], ['CERRADA', 'Cerradas']];

export default function Auditorias() {
  const q = useAuditorias();
  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  return <Indice auditorias={q.data} />;
}

function Indice({ auditorias }: { auditorias: AuditoriaListado[] }) {
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [orden, setOrden] = useState<Orden>('reciente');
  const [visto, setVisto] = useState(false);
  const lista = useRef<HTMLOListElement>(null), gFiltro = useRef<HTMLDivElement>(null), gOrden = useRef<HTMLDivElement>(null);
  const antes = useRef<Flip.FlipState | null>(null);

  // La API ya las entrega de la más reciente a la más antigua
  const filas = useMemo(() => {
    const f = filtro === 'TODAS' ? auditorias : auditorias.filter(a => a.estado === filtro);
    const valor = (a: AuditoriaListado) => (a.estado === 'BORRADOR' ? -1 : Number(a.cumplimiento_pct));
    return orden === 'pct' ? [...f].sort((a, b) => valor(b) - valor(a)) : f;
  }, [auditorias, filtro, orden]);

  // Antes de que React recoloque las filas, se anota dónde está cada una (GSAP Flip)
  const anotar = () => { if (lista.current && !prefersReducedMotion()) antes.current = Flip.getState(lista.current.querySelectorAll('li')); };
  const filtrar = (f: Filtro) => { if (f !== filtro) { anotar(); setFiltro(f); } };
  const ordenar = (o: Orden) => { if (o !== orden) { anotar(); setOrden(o); } };

  useLayoutEffect(() => {
    moverIndicador(gFiltro.current, antes.current !== null); moverIndicador(gOrden.current, antes.current !== null);
    const estado = antes.current, el = lista.current;
    antes.current = null;
    if (!estado || !el) return;
    const ctx = gsap.context(() => {
      Flip.from(estado, { targets: el.querySelectorAll('li'), duration: 0.65, ease: CURVA.cambio, onEnter: els => gsap.fromTo(els, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: CURVA.entrada }) });
    });
    return () => ctx.revert();
  }, [filtro, orden]);

  // Al entrar: las filas en cascada; después cada una dibuja su paso por los estados y su línea de cumplimiento
  useEffect(() => {
    if (lista.current) cascada(lista.current.querySelectorAll('li'), 90);
    const t = requestAnimationFrame(() => setVisto(true));
    const ro = new ResizeObserver(() => { moverIndicador(gFiltro.current, false); moverIndicador(gOrden.current, false); });
    if (gFiltro.current) ro.observe(gFiltro.current);
    return () => { cancelAnimationFrame(t); ro.disconnect(); };
  }, []);

  return (
    <div className={`hoja indice${visto ? ' visto' : ''}`}>
      <header className="lista-cab">
        <h1>Auditorías</h1>
        <Link className="btn" to="/auditorias/nueva">Nueva auditoría</Link>
      </header>
      {auditorias.length === 0 ? <p className="sub">Todavía no hay auditorías. Crea la primera con «Nueva auditoría».</p> : (
        <>
          <div className="herramientas">
            <div className="chips" ref={gFiltro} role="group" aria-label="Filtrar por estado">
              <span className="chip-ind" aria-hidden="true" />
              {FILTROS.map(([v, n]) => <button key={v} className="chip" type="button" aria-pressed={v === filtro} onClick={() => filtrar(v)}>{n}</button>)}
            </div>
            <div className="chips" ref={gOrden} role="group" aria-label="Ordenar">
              <span className="chip-ind" aria-hidden="true" />
              <button className="chip" type="button" aria-pressed={orden === 'reciente'} onClick={() => ordenar('reciente')}>Más recientes</button>
              <button className="chip" type="button" aria-pressed={orden === 'pct'} onClick={() => ordenar('pct')}>Mayor cumplimiento</button>
            </div>
          </div>
          <ol className="lista" ref={lista}>
            {filas.map(a => {
              const paso = ESTADOS_AUDITORIA.indexOf(a.estado), sinAlcance = a.estado === 'BORRADOR', valor = Number(a.cumplimiento_pct);
              return (
                <li key={a.id} data-flip-id={`a${a.id}`}>
                  <Link to={`/auditorias/${a.id}`}>
                    <span className="ident"><span className="org">{a.organizacion}</span><span className="meta num">{fecha(a.fecha_inicio)} – {fecha(a.fecha_fin)} · {a.auditor_nombre}</span></span>
                    <span className="est">
                      <span className="mini" aria-hidden="true">{ESTADOS_AUDITORIA.map((e, k) => <i key={e} className={k <= paso ? 'on' : ''} style={{ '--k': k } as React.CSSProperties} />)}</span>
                      <span>{NOMBRE_ESTADO[a.estado]}{!sinAlcance && ` · ${plural(a.total_controles, 'control', 'controles')}`}</span>
                    </span>
                    <span className="cumpl">
                      {sinAlcance ? <span className="sub">Sin alcance</span> : (
                        <>
                          {/* Cuenta hasta el valor que envía la API y termina exactamente en él */}
                          <CountUp className="pct num" valor={valor} desde={0} ms={1100} formato={pct} />
                          <span className="linea"><i style={{ '--v': valor / 100 } as React.CSSProperties} /></span>
                        </>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          {filas.length === 0 && <p className="sub">Ninguna auditoría en este estado.</p>}
        </>
      )}
    </div>
  );
}
