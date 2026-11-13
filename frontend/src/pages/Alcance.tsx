import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate as resorte } from 'motion';
import { Link, useLocation } from 'react-router-dom';
import { useControles, useDefinirAlcance, useRefrescarAuditoria } from '../api/queries';
import type { ControlISO } from '../api/types';
import { MensajeError } from '../components/basicos';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { Resaltado, normal } from '../components/Resaltado';
import { plural } from '../lib/format';
import { brincar, cascada, moverIndicador, sacudir } from '../motion/efectos';
import { CURVA, Flip, gsap } from '../motion/gsap';
import { prefersReducedMotion, tween } from '../motion/motion';
import { viajeReciente } from '../motion/viaje';

const MIN = 10, MAX = 15;
const grupoDe = (c: ControlISO) => `${c.clausula} · ${c.categoria_tema}`;

/**
 * El alcance de una auditoría en Borrador: se eligen entre 10 y 15 controles del catálogo (RF02, CP-03).
 * A la izquierda el catálogo, con búsqueda y filtro por cláusula; a la derecha, fija, la hoja con los elegidos y el
 * contador de quince casillas. Cada control marcado viaja como una ficha hasta su sitio; al quitarlo, la ficha cae.
 * En Borrador las filas van en línea discontinua: al confirmar, los no elegidos se retiran y la platina fija la hoja.
 */
export function Alcance({ id }: { id: number }) {
  const q = useControles();
  const definir = useDefinirAlcance(id);
  const refrescar = useRefrescarAuditoria(id);
  // Recién creada en «Nueva auditoría»: el contenido espera a que la cabecera llegue a su sitio
  const loc = useLocation();
  const recien = useRef(viajeReciente(loc.state) !== null);

  const [marcados, setMarcados] = useState<ReadonlySet<number>>(new Set());
  const [enVuelo, setEnVuelo] = useState<ReadonlySet<number>>(new Set());
  const [tema, setTema] = useState('TODAS');
  const [texto, setTexto] = useState(''), [busca, setBusca] = useState('');
  const [fijando, setFijando] = useState(false);
  const raiz = useRef<HTMLElement>(null), cat = useRef<HTMLDivElement>(null), lista = useRef<HTMLOListElement>(null), casillas = useRef<HTMLDivElement>(null), gTemas = useRef<HTMLDivElement>(null);
  const llave = useRef<SVGPathElement>(null), boton = useRef<HTMLButtonElement>(null), cifra = useRef<HTMLElement>(null), medidor = useRef<HTMLDivElement>(null);
  const antes = useRef<Flip.FlipState | null>(null), nPrevio = useRef(0), entrado = useRef(false);

  const controles = useMemo(() => q.data ?? [], [q.data]);
  // La hoja sigue el orden del catálogo, no el orden en que se marcó
  const elegidos = useMemo(() => controles.filter(c => marcados.has(c.id)), [controles, marcados]);
  const n = elegidos.length, valido = n >= MIN && n <= MAX;
  const temas = useMemo(() => [...new Set(controles.map(c => c.categoria_tema))], [controles]);
  const visibles = useMemo(() => fijando ? elegidos
    : controles.filter(c => (tema === 'TODAS' || c.categoria_tema === tema) && (!busca || normal(`${c.codigo_iso} ${c.nombre} ${c.criterio_evaluacion}`).includes(normal(busca)))), [controles, elegidos, fijando, tema, busca]);
  const grupos = useMemo(() => { const g = new Map<string, ControlISO[]>(); visibles.forEach(c => { const k = grupoDe(c); if (!g.has(k)) g.set(k, []); g.get(k)!.push(c); }); return [...g]; }, [visibles]);

  // Entrada: en cascada; recién creada, todo a la vez cuando la cabecera ha llegado
  useEffect(() => {
    if (!controles.length || entrado.current || !raiz.current) return;
    entrado.current = true;
    const el = raiz.current;
    if (prefersReducedMotion()) return;
    if (recien.current) { gsap.fromTo(el.querySelectorAll('.seccion-cab, .al-herr > *, .ag-cab, .al-f, .al-hoja > *'), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', delay: 0.5, stagger: 0.03, clearProps: 'all' }); return; }
    cascada(el.querySelectorAll('.seccion-cab, .al-herr > *'), 60);
    cascada(el.querySelectorAll('.ag-cab, .al-f'), 35, 12);
    cascada(el.querySelectorAll('.al-hoja > *'), 70);
  }, [controles.length]);

  // La búsqueda espera a que se deje de escribir; antes de recolocar, se anota dónde está cada fila
  const anotar = () => { if (cat.current && !prefersReducedMotion()) antes.current = Flip.getState(cat.current.querySelectorAll('.al-f, .ag-cab')); };
  useEffect(() => { const t = setTimeout(() => { if (texto.trim() !== busca) { anotar(); setBusca(texto.trim()); } }, 120); return () => clearTimeout(t); }, [texto, busca]);
  const filtrar = (t: string) => { if (t !== tema) { anotar(); setTema(t); } };
  useLayoutEffect(() => {
    // Al fijar, el estado anotado es para el efecto de fijar (más abajo)
    if (fijando) return;
    moverIndicador(gTemas.current, antes.current !== null);
    const estado = antes.current, el = cat.current;
    antes.current = null;
    if (!estado || !el) return;
    const ctx = gsap.context(() => {
      Flip.from(estado, { targets: el.querySelectorAll('.al-f, .ag-cab'), duration: 0.55, ease: CURVA.cambio, absoluteOnLeave: true,
        onEnter: els => gsap.fromTo(els, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, clearProps: 'all' }), onLeave: els => gsap.to(els, { opacity: 0, x: -30, duration: 0.3 }) });
    });
    return () => ctx.revert();
  }, [tema, busca, fijando]);
  useEffect(() => {
    const ro = new ResizeObserver(() => moverIndicador(gTemas.current, false));
    if (gTemas.current) ro.observe(gTemas.current);
    return () => ro.disconnect();
  }, [controles.length]);

  // El número rueda al cambiar; al entrar en el tramo válido se dibuja la llave (DrawSVG) y el botón brinca
  useEffect(() => {
    const previo = nPrevio.current; nPrevio.current = n;
    if (previo !== n && cifra.current && !prefersReducedMotion()) resorte(cifra.current, { y: [n > previo ? 10 : -10, 0], opacity: [0, 1] }, { duration: 0.28, ease: [0.16, 1, 0.3, 1] });
    const antesValido = previo >= MIN && previo <= MAX;
    if (llave.current && valido !== antesValido) {
      if (!valido) gsap.set(llave.current, { drawSVG: '0%' });
      else if (prefersReducedMotion()) gsap.set(llave.current, { drawSVG: '100%' });
      else { gsap.fromTo(llave.current, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.7, ease: CURVA.cambio }); brincar(boton.current, 0.8); }
    }
  }, [n, valido]);
  useEffect(() => { if (definir.error) sacudir(medidor.current); }, [definir.error]);

  /** La ficha con el código viaja de su fila a su sitio en la hoja (o a su casilla, en el móvil). */
  const volar = (c: ControlISO, orden: readonly ControlISO[]) => {
    const k = orden.findIndex(x => x.id === c.id), casilla = casillas.current?.children[k] as HTMLElement | undefined;
    const item = lista.current?.querySelector<HTMLElement>(`[data-id="${c.id}"] .cod`);
    const destino = item && item.offsetParent ? item : casilla;
    const origen = cat.current?.querySelector<HTMLElement>(`[data-id="${c.id}"] .cod`);
    const aterrizar = () => { setEnVuelo(s => { const x = new Set(s); x.delete(c.id); return x; }); brincar(casillas.current?.children[k] ?? null, 0.4); };
    if (prefersReducedMotion() || !destino || !origen) { aterrizar(); return; }
    item?.closest('li')?.scrollIntoView({ block: 'nearest' });
    const a = origen.getBoundingClientRect(), b = destino.getBoundingClientRect(), ficha = document.createElement('span');
    ficha.className = 'ficha'; ficha.textContent = c.codigo_iso; document.body.appendChild(ficha);
    gsap.fromTo(ficha, { x: a.left, y: a.top, scale: 1 }, { x: b.left, y: b.top + (b.height - ficha.offsetHeight) / 2, scale: 0.92, duration: 0.6, ease: CURVA.cambio, onComplete: () => { ficha.remove(); aterrizar(); } });
  };
  /** Dónde está un control en la hoja (o su última casilla, en el móvil), antes de quitarlo. */
  const sitioDe = (c: ControlISO): DOMRect | null => {
    const item = lista.current?.querySelector<HTMLElement>(`[data-id="${c.id}"]`);
    const el = item && item.offsetParent ? item : (Array.from(casillas.current?.querySelectorAll<HTMLElement>('.slot.on') ?? []).pop() ?? null);
    return el ? el.getBoundingClientRect() : null;
  };
  /** Al quitarlo, su ficha cae desde la hoja (Physics2D). */
  const caer = (c: ControlISO, b = sitioDe(c)) => {
    if (prefersReducedMotion() || !b) return;
    const ficha = document.createElement('span');
    ficha.className = 'ficha'; ficha.textContent = c.codigo_iso; document.body.appendChild(ficha);
    gsap.set(ficha, { x: b.left, y: b.top + 4 });
    gsap.to(ficha, { physics2D: { velocity: gsap.utils.random(140, 220), angle: gsap.utils.random(-120, -60), gravity: 900 }, rotation: gsap.utils.random(-60, 60), opacity: 0, duration: 0.75, ease: 'none', onComplete: () => ficha.remove() });
  };

  const alternar = (c: ControlISO, marcar: boolean) => {
    if (marcar === marcados.has(c.id)) return;
    const siguiente = new Set(marcados);
    if (marcar) siguiente.add(c.id); else { caer(c); siguiente.delete(c.id); }
    setMarcados(siguiente); definir.reset();
    if (marcar) { setEnVuelo(s => new Set(s).add(c.id)); const orden = controles.filter(x => siguiente.has(x.id)); requestAnimationFrame(() => volar(c, orden)); }
  };
  /** Marcar o quitar todos los visibles de una cláusula. */
  const alternarGrupo = (cs: readonly ControlISO[]) => {
    const quitar = cs.every(c => marcados.has(c.id)), siguiente = new Set(marcados);
    if (quitar) { const sitios = cs.map(sitioDe); cs.forEach((c, i) => setTimeout(() => caer(c, sitios[i]), prefersReducedMotion() ? 0 : i * 60)); cs.forEach(c => siguiente.delete(c.id)); setMarcados(siguiente); definir.reset(); return; }
    const nuevos = cs.filter(c => !marcados.has(c.id));
    nuevos.forEach(c => siguiente.add(c.id));
    const orden = controles.filter(c => siguiente.has(c.id));
    setMarcados(siguiente); setEnVuelo(s => { const x = new Set(s); nuevos.forEach(c => x.add(c.id)); return x; }); definir.reset();
    nuevos.forEach((c, i) => setTimeout(() => volar(c, orden), prefersReducedMotion() ? 0 : 30 + i * 90));
  };

  const confirmar = () => {
    definir.mutate(elegidos.map(c => c.id), {
      onSuccess: () => {
        // Los no elegidos se retiran y los elegidos se juntan (GSAP Flip): se anota dónde está cada fila
        anotar(); setTema('TODAS'); setTexto(''); setBusca(''); setFijando(true);
      },
    });
  };
  // Fijar: la platina recorre los elegidos y los fija; el JS solo escribe --p. Al terminar se recarga y se abre el trabajo.
  useLayoutEffect(() => {
    if (!fijando) return;
    let cancelar = () => {};
    const fijar = () => {
      const el = raiz.current, c = cat.current;
      c?.style.setProperty('--alto', `${c.offsetHeight}px`);
      cancelar = tween(0, 1, 1300, p => el?.style.setProperty('--p', p.toFixed(4)), () => { setTimeout(() => { void refrescar(); }, prefersReducedMotion() ? 0 : 450); });
    };
    const estadoFlip = antes.current; antes.current = null;
    if (!estadoFlip || !cat.current) { fijar(); return () => cancelar(); }
    const ctx = gsap.context(() => {
      Flip.from(estadoFlip, { targets: cat.current!.querySelectorAll('.al-f, .ag-cab'), duration: 0.65, ease: CURVA.cambio, stagger: 0.02, absoluteOnLeave: true, onLeave: els => gsap.to(els, { opacity: 0, x: -30, duration: 0.3, stagger: 0.03 }), onComplete: fijar });
    });
    return () => { ctx.revert(); cancelar(); };
  }, [fijando, refrescar]);

  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;

  let orden = 0;
  return (
    <section className="al" ref={raiz} style={{ '--n': Math.max(1, n) } as React.CSSProperties} aria-label="Alcance de la auditoría">
      <header className="seccion-cab"><div><h2>Alcance de la auditoría</h2><p>Entre {MIN} y {MAX} controles del catálogo ISO/IEC 27002:2022 (CP-03). El catálogo tiene {controles.length}.</p></div></header>
      <div className="al-cuerpo">
        <div className="al-izq">
          <div className="al-herr" style={fijando ? { visibility: 'hidden' } : undefined}>
            <label className="buscar"><span className="rot">Buscar</span><input type="search" placeholder="Código, nombre o criterio" autoComplete="off" value={texto} onChange={e => setTexto(e.target.value)} /></label>
            <div className="chips" ref={gTemas} role="group" aria-label="Filtrar por cláusula">
              <span className="chip-ind" aria-hidden="true" />
              <button className="chip" type="button" aria-pressed={tema === 'TODAS'} onClick={() => filtrar('TODAS')}>Todas <span className="num">{controles.length}</span></button>
              {temas.map(t => <button key={t} className="chip" type="button" aria-pressed={tema === t} onClick={() => filtrar(t)}>{t} <span className="num">{controles.filter(c => c.categoria_tema === t).length}</span></button>)}
            </div>
          </div>
          <div className={`al-cat${fijando ? ' fijado' : ''}`} ref={cat}>
            {visibles.length === 0 && <p className="vacio">Ningún control coincide con «{busca}».</p>}
            {grupos.map(([g, cs]) => {
              const todos = cs.every(c => marcados.has(c.id)), cuantos = cs.length === 1 ? '' : ` los ${cs.length}`;
              return (
                <Fragment key={g}>
                  <div className="ag-cab" data-flip-id={`g${g}`}>
                    <b>{g}<span className="num">{cs.length}</span></b>
                    {!fijando && <button className="enlace" type="button" onClick={() => alternarGrupo(cs)} disabled={definir.isPending}>{todos ? `Quitar${cuantos}` : `Marcar${cuantos}`}</button>}
                  </div>
                  {cs.map(c => {
                    const marcado = marcados.has(c.id), i = fijando ? orden++ : 0;
                    return (
                      <div className={`al-f${marcado ? ' on' : ''}`} key={c.id} data-id={c.id} data-flip-id={`k${c.id}`} style={{ '--i': i } as React.CSSProperties}>
                        <label>
                          <input type="checkbox" checked={marcado} disabled={fijando || definir.isPending} onChange={e => alternar(c, e.target.checked)} />
                          <span className="chk" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2 6.5 L5 9.2 L10.2 3" /></svg></span>
                          <span className="cod num"><Resaltado texto={c.codigo_iso} q={busca} /></span>
                          <span className="nom"><Resaltado texto={c.nombre} q={busca} /></span>
                          <span className="crit"><Resaltado texto={c.criterio_evaluacion} q={busca} /></span>
                          <span className="attr">{c.attr_tipo_control}<br />{c.attr_propiedades_cia}</span>
                        </label>
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
            <i className="al-platina" aria-hidden="true" />
          </div>
        </div>

        <aside className={`al-hoja${fijando ? ' fijado' : ''}`} aria-label="Controles elegidos">
          <p className="rot ah-tit">Controles elegidos</p>
          <p className="ah-cuenta"><b className="ah-n num" ref={cifra}>{n}</b><span>de {MIN} a {MAX}</span></p>
          <div className="ah-medidor" ref={medidor}>
            <div className={`slots-w${valido ? ' ok' : ''}`}>
              <div className="llave" aria-hidden="true"><svg viewBox="0 0 100 9" preserveAspectRatio="none"><path d="M0.4 9 V1.2 H99.6 V9" /><path className="viva" ref={llave} d="M0.4 9 V1.2 H99.6 V9" /></svg></div>
              <div className={`slots${valido ? ' ok' : ''}`} ref={casillas} aria-hidden="true">
                {Array.from({ length: MAX }, (_, k) => { const c = elegidos[k]; return <i key={k} className={`slot${c && !enVuelo.has(c.id) ? ' on' : ''}`} style={{ '--w': Math.abs(k - (MIN - 1)) } as React.CSSProperties}><b /><em /></i>; })}
              </div>
            </div>
            <div className="escala" aria-hidden="true"><span style={{ left: `${(0.5 / MAX) * 100}%` }}>1</span><span style={{ left: `${((MIN - 0.5) / MAX) * 100}%` }}>{MIN}</span><span style={{ left: `${((MAX - 0.5) / MAX) * 100}%` }}>{MAX}</span></div>
          </div>
          <p className={`ah-msg${valido ? ' ok' : ''}`} role="status">
            {fijando ? `Alcance definido con ${plural(n, 'control', 'controles')}. Fijando la hoja y abriendo la evaluación…`
              : n < MIN ? `${MIN - n === 1 ? 'Falta 1 control' : `Faltan ${MIN - n} controles`} para el mínimo.` : n > MAX ? `Sobran ${n - MAX}.` : 'Alcance válido.'}
          </p>
          <ol className="ah-sel" ref={lista}>
            {n === 0 && <li className="ah-vacio">Todavía no hay controles. Márcalos en el catálogo.</li>}
            {elegidos.map(c => (
              <li key={c.id} className={`ah-i${enVuelo.has(c.id) ? ' llegando' : ''}`} data-id={c.id}>
                <span className="cod num">{c.codigo_iso}</span><span>{c.nombre}</span>
                <button className="ah-x" type="button" aria-label={`Quitar ${c.codigo_iso}`} disabled={fijando || definir.isPending} onClick={() => alternar(c, false)}>×</button>
              </li>
            ))}
          </ol>
          {definir.isError && <MensajeError>{definir.error.message}</MensajeError>}
          <div className="ah-acc">
            <button className="btn" type="button" ref={boton} disabled={!valido || definir.isPending || fijando} onClick={confirmar}>{definir.isPending ? 'Guardando…' : 'Confirmar alcance'}</button>
            <p className="ah-nota">Al confirmar, el alcance queda escrito en la bitácora y ya no se puede cambiar.</p>
            <Link className="enlace ah-volver" to="/auditorias">Volver a las auditorías</Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
