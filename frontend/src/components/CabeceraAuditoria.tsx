import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { animate as animar, stagger } from 'animejs';
import { NavLink, useLocation } from 'react-router-dom';
import { useIntegridad, useTrazabilidad } from '../api/queries';
import type { AuditoriaDetalle, EstadoAuditoria, Eslabon } from '../api/types';
import { ESTADOS_AUDITORIA, NOMBRE_ESTADO, fecha, plural } from '../lib/format';
import { sinEvaluar } from '../lib/traza';
import { cascada, moverIndicador } from '../motion/efectos';
import { prefersReducedMotion } from '../motion/motion';
import { useMiga } from './Miga';

/** La fecha en que la bitácora registró la entrada en cada fase. */
function fechasDeFases(eslabones: readonly Eslabon[]): Partial<Record<EstadoAuditoria, string>> {
  const f: Partial<Record<EstadoAuditoria, string>> = {};
  for (const e of eslabones) {
    if (e.tipo_evento === 'CREACION_AUDITORIA') f.BORRADOR = e.timestamp_utc;
    else if (e.tipo_evento === 'ALCANCE_DEFINIDO') f.EN_EJECUCION = e.timestamp_utc;
    else if (e.tipo_evento === 'CIERRE_INFORME') f.CERRADA = e.timestamp_utc;
    else if (e.tipo_evento === 'CAMBIO_ESTADO') {
      try { if ((JSON.parse(e.payload_canonico) as { estado_nuevo?: string }).estado_nuevo === 'EN_REVISION') f.EN_REVISION = e.timestamp_utc; } catch { /* payload ilegible: sin fecha */ }
    }
  }
  return f;
}

interface Pestana { a: string; nombre: string; meta: string; fin?: boolean }

/**
 * Cabecera de auditoría: la misma en todas sus pantallas. Organización y datos, las cuatro fases con la fecha en
 * que la bitácora registró cada una y las pestañas de las vistas que existen en su estado:
 * Alcance (Borrador) · Trabajo, Revisión e Historia (en curso) · Acta e Historia (cerrada).
 * Vive en la ruta contenedora, así que no se vuelve a montar al cambiar de pestaña: el indicador se desliza.
 */
export function CabeceraAuditoria({ datos }: { datos: AuditoriaDetalle }) {
  const { auditoria: a, evaluaciones } = datos;
  const enCurso = a.estado === 'EN_EJECUCION' || a.estado === 'EN_REVISION', cerrada = a.estado === 'CERRADA';
  const integ = useIntegridad(a.id, true);
  const traz = useTrazabilidad(a.id, enCurso);
  const loc = useLocation(), miga = useMiga();
  const raiz = useRef<HTMLElement>(null), titulo = useRef<HTMLHeadingElement>(null), pestanas = useRef<HTMLDivElement>(null), primera = useRef(true);

  const fechas = useMemo(() => fechasDeFases(integ.data?.eslabones ?? []), [integ.data]);
  const nEventos = integ.data?.eslabones.length;
  const base = `/auditorias/${a.id}`;
  const lista: Pestana[] = a.estado === 'BORRADOR'
    ? [{ a: base, nombre: 'Alcance', meta: 'Elige de 10 a 15 controles', fin: true }]
    : cerrada
      ? [{ a: `${base}/cierre`, nombre: 'Acta', meta: fechas.CERRADA ? `Sellada el ${fecha(fechas.CERRADA)}` : 'Sellada' }, { a: `${base}/historia`, nombre: 'Historia', meta: nEventos ? plural(nEventos, 'evento', 'eventos') : '…' }]
      : [
        { a: base, nombre: 'Trabajo', meta: `${evaluaciones.filter(e => !sinEvaluar(e)).length} de ${evaluaciones.length} evaluados`, fin: true },
        { a: `${base}/cierre`, nombre: 'Revisión', meta: !traz.data ? '…' : traz.data.total_anomalias ? plural(traz.data.total_anomalias, 'anomalía', 'anomalías') : 'Lista para cerrar' },
        { a: `${base}/historia`, nombre: 'Historia', meta: nEventos ? plural(nEventos, 'evento', 'eventos') : '…' },
      ];
  const vista = loc.pathname.endsWith('/historia') ? 'Historia' : loc.pathname.endsWith('/cierre') ? (cerrada ? 'Acta' : 'Revisión') : a.estado === 'BORRADOR' ? 'Alcance' : 'Trabajo';

  // La barra de documento dice dónde estamos
  useEffect(() => { miga.poner({ id: a.id, organizacion: a.organizacion, vista }); }, [miga, a.id, a.organizacion, vista]);
  useEffect(() => () => { miga.poner(null); miga.nombreFuera(false); }, [miga]);
  // Cuando el título grande sale de la pantalla, el nombre de la auditoría pasa a la barra
  useEffect(() => {
    const h = titulo.current; if (!h) return;
    const io = new IntersectionObserver(([x]) => miga.nombreFuera(!x!.isIntersecting && x!.boundingClientRect.top < 80), { rootMargin: '-64px 0px 0px 0px' });
    io.observe(h); return () => io.disconnect();
  }, [miga]);

  // El indicador de la pestaña activa se desliza con un resorte (NavLink marca la activa con aria-current)
  useLayoutEffect(() => {
    moverIndicador(pestanas.current, !primera.current, '[aria-current="page"]', '.pest-ind');
  }, [loc.pathname, lista.length]);
  useEffect(() => {
    const ro = new ResizeObserver(() => moverIndicador(pestanas.current, false, '[aria-current="page"]', '.pest-ind'));
    if (pestanas.current) ro.observe(pestanas.current);
    return () => ro.disconnect();
  }, []);

  // Al abrir la auditoría: los datos en cascada y las fases se encienden una tras otra
  useEffect(() => {
    primera.current = false;
    const el = raiz.current; if (!el || prefersReducedMotion()) return;
    cascada(el.querySelectorAll('.cab-a > *'), 70);
    animar(el.querySelectorAll('.fase i'), { scale: [0, 1], duration: 500, ease: 'outBack', delay: stagger(140, { start: 250 }) });
  }, [a.id]);

  const k = ESTADOS_AUDITORIA.indexOf(a.estado);
  return (
    <section className="cab" ref={raiz} aria-label="Auditoría">
      <div className="cab-a">
        <p className="rot">Auditoría n.º {a.id} · ISO/IEC 27002:2022 · ISO 19011:2018</p>
        <h1 className="cab-org" ref={titulo}>{a.organizacion}</h1>
        <p className="cab-datos"><span className="alc">{a.alcance}</span><span className="num">{fecha(a.fecha_inicio)} – {fecha(a.fecha_fin)}</span><span>{a.auditor_nombre}</span></p>
      </div>
      <ol className="fases" aria-label="Fases de la auditoría">
        {ESTADOS_AUDITORIA.map((s, i) => (
          <li key={s} className={`fase${i < k ? ' hecha' : i === k ? ' actual' : ''}`} aria-current={i === k ? 'step' : undefined}>
            <i aria-hidden="true" /><b>{NOMBRE_ESTADO[s]}</b><span className="fecha num">{i <= k && fechas[s] ? fecha(fechas[s]!) : ' '}</span>
          </li>
        ))}
      </ol>
      <div className="pestanas-w">
        <div className="pestanas" ref={pestanas} role="navigation" aria-label="Vistas de la auditoría">
          <span className="pest-ind" aria-hidden="true" />
          {lista.map(p => <NavLink key={p.a} to={p.a} end={p.fin} className="pest"><b>{p.nombre}</b><small className="num">{p.meta}</small></NavLink>)}
        </div>
      </div>
    </section>
  );
}
