import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate as resorte } from 'motion';
import { Link } from 'react-router-dom';
import { useControles, useDefinirAlcance, useRefrescarAuditoria } from '../api/queries';
import type { ControlISO } from '../api/types';
import { MensajeError } from '../components/basicos';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { plural } from '../lib/format';
import { brincar, cascada, sacudir } from '../motion/efectos';
import { CURVA, Flip, gsap } from '../motion/gsap';
import { prefersReducedMotion, tween } from '../motion/motion';

const MIN = 10, MAX = 15;

/**
 * El alcance de una auditoría en Borrador: se eligen entre 10 y 15 controles del catálogo (RF02, CP-03).
 * El contador son quince casillas siempre a la vista. Cada control marcado sale de su fila como una ficha
 * y va a ocupar su casilla; al desmarcarlo, la ficha cae. Al confirmar, la hoja fija los controles elegidos.
 */
export function Alcance({ id }: { id: number }) {
  const q = useControles();
  const definir = useDefinirAlcance(id);
  const refrescar = useRefrescarAuditoria(id);

  const [marcados, setMarcados] = useState<ReadonlySet<number>>(new Set());
  const [enVuelo, setEnVuelo] = useState<ReadonlySet<number>>(new Set());
  const [filtro, setFiltro] = useState('TODAS');
  const [fijando, setFijando] = useState(false);
  const acta = useRef<HTMLDivElement>(null), cat = useRef<HTMLOListElement>(null), casillas = useRef<HTMLDivElement>(null);
  const llave = useRef<SVGPathElement>(null), boton = useRef<HTMLButtonElement>(null), cifra = useRef<HTMLSpanElement>(null), medidor = useRef<HTMLDivElement>(null);
  const antes = useRef<Flip.FlipState | null>(null), nPrevio = useRef(0), entrado = useRef(false);

  const controles = useMemo(() => q.data ?? [], [q.data]);
  // Las casillas siguen el orden del catálogo, no el orden en que se marcó
  const elegidos = useMemo(() => controles.filter(c => marcados.has(c.id)), [controles, marcados]);
  const n = elegidos.length, valido = n >= MIN && n <= MAX;
  const temas = useMemo(() => [...new Set(controles.map(c => c.categoria_tema))], [controles]);
  const visibles = filtro === 'TODAS' ? controles : controles.filter(c => c.categoria_tema === filtro);

  // Entrada: el catálogo entra en cascada
  useEffect(() => {
    if (!controles.length || entrado.current) return;
    entrado.current = true;
    if (cat.current) cascada(cat.current.querySelectorAll('.ctl'), 40);
  }, [controles.length]);

  // El número rueda al cambiar; al entrar en el tramo válido se dibuja la llave (DrawSVG) y el botón brinca
  useEffect(() => {
    const previo = nPrevio.current; nPrevio.current = n;
    if (previo !== n && cifra.current && !prefersReducedMotion()) resorte(cifra.current, { y: [n > previo ? 10 : -10, 0], opacity: [0, 1] }, { duration: 0.28, ease: [0.16, 1, 0.3, 1] });
    const antesValido = previo >= MIN && previo <= MAX;
    if (valido && !antesValido && llave.current) {
      if (prefersReducedMotion()) gsap.set(llave.current, { drawSVG: '100%' });
      else { gsap.fromTo(llave.current, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.7, ease: CURVA.cambio }); brincar(boton.current, 0.8); }
    }
  }, [n, valido]);
  useEffect(() => { if (definir.error) sacudir(medidor.current); }, [definir.error]);

  /** Una ficha con el código del control viaja de su fila a su casilla. */
  const volar = (c: ControlISO, orden: readonly ControlISO[]) => {
    const destino = casillas.current?.children[orden.findIndex(x => x.id === c.id)] as HTMLElement | undefined;
    const origen = cat.current?.querySelector<HTMLElement>(`[data-id="${c.id}"] .cod`);
    const aterrizar = () => setEnVuelo(s => { const x = new Set(s); x.delete(c.id); return x; });
    if (prefersReducedMotion() || !destino || !origen) { aterrizar(); return; }
    const a = origen.getBoundingClientRect(), b = destino.getBoundingClientRect(), ficha = document.createElement('span');
    ficha.className = 'ficha'; ficha.textContent = c.codigo_iso; document.body.appendChild(ficha);
    gsap.fromTo(ficha, { x: a.left, y: a.top, scale: 1 }, { x: b.left + (b.width - ficha.offsetWidth) / 2, y: b.top + (b.height - ficha.offsetHeight) / 2, scale: 0.85, duration: 0.55, ease: CURVA.cambio, onComplete: () => { ficha.remove(); aterrizar(); brincar(destino, 0.5); } });
  };
  /** La ficha de un control desmarcado cae desde la casilla que queda libre (Physics2D). */
  const caer = (codigo: string, indice: number) => {
    const casilla = casillas.current?.children[indice] as HTMLElement | undefined;
    if (prefersReducedMotion() || !casilla) return;
    const b = casilla.getBoundingClientRect(), ficha = document.createElement('span');
    ficha.className = 'ficha'; ficha.textContent = codigo; document.body.appendChild(ficha);
    gsap.set(ficha, { x: b.left, y: b.top });
    gsap.to(ficha, { physics2D: { velocity: gsap.utils.random(140, 220), angle: gsap.utils.random(-120, -60), gravity: 900 }, rotation: gsap.utils.random(-60, 60), opacity: 0, duration: 0.75, ease: 'none', onComplete: () => ficha.remove() });
  };

  const alternar = (c: ControlISO, marcar: boolean) => {
    const siguiente = new Set(marcados);
    if (marcar) siguiente.add(c.id); else siguiente.delete(c.id);
    setMarcados(siguiente); definir.reset();
    if (marcar) { setEnVuelo(s => new Set(s).add(c.id)); volar(c, controles.filter(x => siguiente.has(x.id))); }
    else caer(c.codigo_iso, siguiente.size);
  };
  const marcarVisibles = () => {
    const nuevos = visibles.filter(c => !marcados.has(c.id));
    if (!nuevos.length) return;
    const siguiente = new Set(marcados); nuevos.forEach(c => siguiente.add(c.id));
    const orden = controles.filter(c => siguiente.has(c.id));
    setMarcados(siguiente); setEnVuelo(s => { const x = new Set(s); nuevos.forEach(c => x.add(c.id)); return x; }); definir.reset();
    nuevos.forEach((c, i) => window.setTimeout(() => volar(c, orden), prefersReducedMotion() ? 0 : i * 70));
  };
  const quitarTodos = () => { elegidos.forEach((c, i) => window.setTimeout(() => caer(c.codigo_iso, i), i * 35)); setMarcados(new Set()); setEnVuelo(new Set()); definir.reset(); };

  const confirmar = () => {
    definir.mutate(elegidos.map(c => c.id), {
      onSuccess: () => {
        // Los controles que no entran se retiran y los elegidos se juntan (GSAP Flip): se anota dónde está cada fila
        if (cat.current && !prefersReducedMotion()) antes.current = Flip.getState(cat.current.querySelectorAll('.ctl'));
        setFiltro('TODAS'); setFijando(true);
      },
    });
  };
  useLayoutEffect(() => {
    if (!fijando) return;
    let cancelar = () => {};
    // La línea recorre la hoja y fija los controles; el JS solo escribe --p. Al terminar se recarga y se abre el trabajo.
    const fijar = () => { cancelar = tween(0, 1, 1200, p => acta.current?.style.setProperty('--p', p.toFixed(4)), () => { void refrescar(); }); };
    const estadoFlip = antes.current; antes.current = null;
    if (!estadoFlip || !cat.current) { fijar(); return () => cancelar(); }
    const ctx = gsap.context(() => {
      Flip.from(estadoFlip, { targets: cat.current!.querySelectorAll('.ctl'), duration: 0.7, ease: CURVA.cambio, stagger: 0.025, absoluteOnLeave: true, onLeave: els => gsap.to(els, { opacity: 0, x: -30, duration: 0.3, stagger: 0.03 }), onComplete: fijar });
    });
    return () => { ctx.revert(); cancelar(); };
  }, [fijando, refrescar]);

  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;

  let orden = 0;
  return (
    <div className="acta" ref={acta} style={{ '--n': Math.max(1, n) } as React.CSSProperties}>
      <div className="hoja">
        <div className="hoja-cuerpo">
          <div className="filtros" role="group" aria-label="Filtrar por categoría">
            {fijando ? <span className="sub">Alcance de la auditoría</span> : (
              <>
                <button type="button" aria-pressed={filtro === 'TODAS'} onClick={() => setFiltro('TODAS')}>Todas <span className="num">{controles.length}</span></button>
                {temas.map(t => <button key={t} type="button" aria-pressed={filtro === t} onClick={() => setFiltro(t)}>{t} <span className="num">{controles.filter(c => c.categoria_tema === t).length}</span></button>)}
                <span className="sep" />
                <button type="button" onClick={marcarVisibles}>Marcar {visibles.length === 1 ? 'el visible' : `los ${visibles.length} visibles`}</button>
                <button type="button" onClick={quitarTodos} disabled={n === 0}>Quitar todos</button>
              </>
            )}
          </div>
          <ol className={fijando ? 'fijado' : undefined} ref={cat}>
            {controles.map(c => {
              const marcado = marcados.has(c.id), oculto = fijando ? !marcado : filtro !== 'TODAS' && c.categoria_tema !== filtro;
              const i = fijando && marcado ? orden++ : 0;
              return (
                <li className="ctl" key={c.id} data-id={c.id} data-flip-id={`k${c.id}`} hidden={oculto} style={{ '--i': i } as React.CSSProperties}>
                  <label>
                    <input type="checkbox" checked={marcado} disabled={fijando || definir.isPending} onChange={e => alternar(c, e.target.checked)} />
                    <span className="cod num">{c.codigo_iso}</span><span className="nom">{c.nombre}</span><span className="tema">{c.categoria_tema} · {c.attr_tipo_control}</span>
                  </label>
                </li>
              );
            })}
          </ol>
          <div className="platina" />
        </div>

        {!fijando && (
          <div className="medidor" ref={medidor}>
            <div>
              <div className={`slots-w${valido ? ' ok' : ''}`}>
                <div className="llave" aria-hidden="true"><svg viewBox="0 0 100 9" preserveAspectRatio="none"><path d="M0.4 9 V1.2 H99.6 V9" /><path className="viva" ref={llave} d="M0.4 9 V1.2 H99.6 V9" /></svg></div>
                <div className={`slots${valido ? ' ok' : ''}`} ref={casillas} aria-hidden="true">
                  {Array.from({ length: MAX }, (_, k) => { const c = elegidos[k]; return <i key={k} className={`slot${c && !enVuelo.has(c.id) ? ' on' : ''}`} style={{ '--w': Math.abs(k - (MIN - 1)) } as React.CSSProperties}><b /><em /><span>{c?.codigo_iso}</span></i>; })}
                </div>
              </div>
              <div className="escala" aria-hidden="true"><span style={{ left: `${(0.5 / MAX) * 100}%` }}>1</span><span style={{ left: `${((MIN - 0.5) / MAX) * 100}%` }}>{MIN}</span><span style={{ left: `${((MAX - 0.5) / MAX) * 100}%` }}>{MAX}</span></div>
            </div>
            <div className="medidor-txt">
              <p role="status"><span className="cuenta-n num" ref={cifra}>{n}</span>{' '}de {MIN} a {MAX}. {n < MIN ? `${MIN - n === 1 ? 'Falta' : 'Faltan'} ${plural(MIN - n, 'control', 'controles')} para el mínimo.` : n > MAX ? `Sobran ${n - MAX}.` : 'Alcance válido.'}</p>
              {definir.isError && <MensajeError>{definir.error.message}</MensajeError>}
              <div className="fila-acc">
                <button className="btn" type="button" ref={boton} disabled={!valido || definir.isPending} onClick={confirmar}>{definir.isPending ? 'Guardando…' : 'Confirmar alcance'}</button>
                <Link className="enlace" to="/auditorias">Volver a las auditorías</Link>
              </div>
            </div>
          </div>
        )}
        {fijando && <p className="sub entra" role="status">Alcance definido con {plural(n, 'control', 'controles')}. Abriendo la evaluación…</p>}
      </div>
    </div>
  );
}
