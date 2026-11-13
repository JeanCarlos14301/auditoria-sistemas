import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { animate as animar, stagger, type JSAnimation } from 'animejs';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useInforme, useIntegridad } from '../api/queries';
import type { InformeSellado, VerificacionIntegridad } from '../api/types';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { Hoja, Rueda, fraseVerificacion, huellaDe, seccionesDe, type Bloque } from '../components/informe/contenido';
import { textoOrla } from '../components/Sello';
import { crearSello } from '../components/selloImperativo';
import { pct } from '../lib/format';
import { repartir, type Colocado } from '../lib/paginar';
import { cascada } from '../motion/efectos';
import { CURVA, Flip, gsap } from '../motion/gsap';
import { prefersReducedMotion } from '../motion/motion';

/** Ancho de la hoja A4 a 96 ppp; las hojas se escalan en pantalla respecto a él. */
const ANCHO_A4 = 794;

/**
 * Vista de impresión del informe (RF08), solo con la auditoría cerrada.
 * La pantalla enseña las hojas A4 tal como se imprimen; "Imprimir" abre el diálogo del navegador con ellas.
 */
export default function Informe() {
  const id = Number(useParams().id), valido = Number.isInteger(id) && id > 0;
  const informe = useInforme(id, valido), integ = useIntegridad(id, valido);
  if (!valido) return <Navigate to="/auditorias" replace />;
  // La API responde 404 si la auditoría no está cerrada (o no existe): su pantalla sabe qué mostrar
  if (informe.isError) return informe.error.status === 404 ? <Navigate to={`/auditorias/${id}`} replace /> : <ErrorPagina error={informe.error} />;
  if (integ.isError) return <ErrorPagina error={integ.error} />;
  // Se espera a la verificación recién hecha: no se imprime con una guardada de antes
  if (informe.isPending || integ.isPending || integ.isFetching) return <Cargando />;
  return <Pliego informe={informe.data.informe} integ={integ.data} />;
}

function Pliego({ informe, integ }: { informe: InformeSellado; integ: VerificacionIntegridad }) {
  const snap = informe.snapshot_json, aud = snap.auditoria, total_eslabones = integ.eslabones.length;
  const secciones = useMemo(() => seccionesDe(informe, integ), [informe, integ]);
  const [fuentes, setFuentes] = useState(false);
  const [reparto, setReparto] = useState<Record<string, Colocado[][]> | null>(null);
  const [incluye, setIncluye] = useState<Record<string, boolean>>({ hallazgos: true, bitacora: true });
  const [fase, setFase] = useState<'verificando' | 'hecha'>('verificando');
  const [actual, setActual] = useState(0);
  const [chico, setChico] = useState(false);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null), pliego = useRef<HTMLDivElement>(null), rail = useRef<HTMLElement>(null), medidor = useRef<HTMLDivElement>(null), cuenta = useRef<HTMLSpanElement>(null);
  const antes = useRef<Flip.FlipState | null>(null), terminar = useRef<() => void>(() => {});
  const listo = reparto !== null;

  const titulo = `Informe de auditoría n.º ${aud.id} · ${aud.organizacion}`, huella = huellaDe(informe, integ);
  const hojas = useMemo(() => (reparto ? secciones.flatMap(s => (reparto[s.id] ?? []).map((bloques, k) => ({ clave: `${s.id}-${k}`, sec: s, bloques, fuera: s.opcion !== undefined && !incluye[s.id] }))) : []), [reparto, secciones, incluye]);
  const visibles = hojas.filter(h => !h.fuera), total = visibles.length;
  const bloque = (b: Bloque, repetido?: boolean) => <div key={repetido ? `${b.clave}-rep` : b.clave} className={b.clase}>{b.nodo}</div>;

  // El nombre del documento es el que el navegador propone al guardar el PDF
  useEffect(() => { const previo = document.title; document.title = titulo; return () => { document.title = previo; }; }, [titulo]);

  // Las hojas se reparten con las fuentes ya cargadas: con la de respaldo se partirían por otro sitio
  useEffect(() => {
    let vivo = true; const ya = () => { if (vivo) setFuentes(true); };
    const t = window.setTimeout(ya, 2500);
    void document.fonts.ready.then(ya);
    return () => { vivo = false; clearTimeout(t); };
  }, []);
  useLayoutEffect(() => {
    if (!fuentes || !medidor.current) return;
    const nuevo: Record<string, Colocado[][]> = {};
    for (const s of secciones) {
      const cuerpo = medidor.current.querySelector<HTMLElement>(`[data-sec="${s.id}"] .a4-cuerpo`);
      if (!cuerpo) continue;
      const util = cuerpo.clientHeight - parseFloat(getComputedStyle(cuerpo).paddingTop);
      const medidas = Array.from(cuerpo.children, (el, i) => ({ alto: (el as HTMLElement).offsetHeight, margen: parseFloat(getComputedStyle(el).marginTop) || 0, pegado: s.bloques[i]?.pegado, cabecera: s.bloques[i]?.cabecera, fila: s.bloques[i]?.fila }));
      nuevo[s.id] = repartir(medidas, util);
    }
    setReparto(nuevo);
  }, [secciones, fuentes]);

  // Escala de las hojas: el JS solo escribe --s (y --z, la de la hoja ampliada en móvil)
  useLayoutEffect(() => {
    const el = pliego.current;
    if (!el || !listo) return;
    const medir = () => {
      const marco = el.querySelector<HTMLElement>('.inf-marco:not(.inf-fuera)');
      if (!marco) return;
      const s = Math.min(1, marco.clientWidth / ANCHO_A4);
      el.style.setProperty('--s', s.toFixed(4)); el.style.setProperty('--z', Math.max(s * 2.3, 0.82).toFixed(3));
      setChico(s < 0.7); if (s >= 0.7) setAmpliada(null);
    };
    const ro = new ResizeObserver(medir); ro.observe(el); medir();
    return () => ro.disconnect();
  }, [listo]);
  useEffect(() => { pliego.current?.querySelectorAll('.inf-marco:not(.zoom) .inf-visor').forEach(v => v.scrollTo(0, 0)); }, [ampliada]);

  // Al abrir: el sello se compone eslabón a eslabón con el resultado de la verificación y, al terminar,
  // cada hoja recibe su huella. Con la cadena alterada, el recorrido se detiene en la ruptura y las hojas quedan marcadas.
  useEffect(() => {
    const caja = pliego.current?.querySelector<HTMLElement>('[data-sello]');
    if (!listo || !caja || !pliego.current) return;
    const hojasEl = pliego.current, ruptura = integ.cadena.ruptura;
    const sello = crearSello(caja, integ.eslabones.map(e => e.tipo_evento));
    const anims: JSAnimation[] = [], esperas: number[] = []; let vivo = true;
    const todos = (sel: string) => Array.from(hojasEl.querySelectorAll<HTMLElement>(sel));
    const minis = () => Array.from(rail.current?.querySelectorAll<HTMLElement>('.inf-mini') ?? []);
    const limpiar = (els: HTMLElement[]) => els.forEach(e => { e.style.removeProperty('opacity'); e.style.removeProperty('transform'); });
    const parar = () => { anims.forEach(a => a.cancel()); esperas.forEach(clearTimeout); };
    const asentar = (fuerte: boolean) => {
      sello.hasta(total_eslabones); sello.romper(ruptura ? ruptura.posicion : null); sello.forma(integ.hash_final, fuerte ? 420 : 0);
      sello.textos(pct(informe.cumplimiento_pct), textoOrla(integ, snap.fecha_cierre.slice(0, 10))); sello.sellar(true, fuerte);
    };
    /** Estado final de golpe: con movimiento reducido y justo antes de imprimir. */
    const finalizar = () => { parar(); asentar(false); limpiar(todos('.a4-huella')); limpiar(todos('.a4-agua')); minis().forEach(m => { m.dataset.ok = '1'; }); };
    terminar.current = () => { if (vivo) { finalizar(); flushSync(() => setFase('hecha')); } };

    if (prefersReducedMotion()) { finalizar(); setFase('hecha'); return () => { vivo = false; sello.destruir(); }; }
    setFase('verificando'); minis().forEach(m => { delete m.dataset.ok; });
    cascada(hojasEl.querySelectorAll('.a4-cub > *'), 60);
    const o = { k: 0 }, tope = Math.min(total_eslabones, integ.cadena.eslabones_verificados + (integ.integra ? 0 : 1)); let ultimo = -1;
    anims.push(animar(o, { k: tope, duration: 1500, delay: 250, ease: 'linear',
      onUpdate: () => {
        const k = Math.round(o.k); if (k === ultimo) return; ultimo = k;
        sello.hasta(k); if (k > 0) sello.forma(integ.eslabones[k - 1]!.hash_actual, 70);
        if (cuenta.current) cuenta.current.textContent = `Verificando la cadena: eslabón ${k} de ${total_eslabones}`;
      },
      onComplete: () => {
        if (!vivo) return;
        const huellas = todos('.a4-huella'); huellas.forEach(h => { h.style.opacity = '0'; });
        asentar(true); flushSync(() => setFase('hecha'));
        // La huella cae hoja por hoja; en el carril, cada nudo se llena al mismo paso
        anims.push(animar(huellas, { opacity: [0, 1], scale: [1.5, 1], duration: 520, ease: 'outBack', delay: stagger(110, { start: 250 }), onComplete: () => limpiar(huellas) }));
        minis().forEach((m, i) => esperas.push(window.setTimeout(() => { m.dataset.ok = '1'; }, 250 + i * 110)));
        if (!integ.integra) { const aguas = todos('.a4-agua'); anims.push(animar(aguas, { opacity: [0, 0.13], scale: [1.3, 1], duration: 600, ease: 'outExpo', delay: stagger(110, { start: 250 }), onComplete: () => limpiar(aguas) })); }
      } }));
    return () => { vivo = false; parar(); sello.destruir(); };
  }, [listo, integ, informe, snap.fecha_cierre, total_eslabones]);

  // El carril lleva una copia a escala de cada hoja (solo imagen: no se puede enfocar ni leer con lector de pantalla)
  useEffect(() => {
    if (!listo || !pliego.current || !rail.current) return;
    const marcos = pliego.current.querySelectorAll('.inf-marco');
    rail.current.querySelectorAll('.inf-mini-hoja').forEach((hueco, i) => {
      const copia = marcos[i]?.querySelector('.a4')?.cloneNode(true) as HTMLElement | undefined;
      if (!copia) return;
      copia.inert = true; copia.removeAttribute('aria-label'); hueco.replaceChildren(copia);
    });
  }, [listo, fase, hojas]);

  // Scroll: --p es el avance por el pliego; la hoja que cruza el 40 % de la ventana es la actual
  useEffect(() => {
    if (!listo) return;
    let pide = 0;
    const seguir = () => {
      pide = 0;
      const ms = Array.from(pliego.current?.querySelectorAll<HTMLElement>('.inf-marco:not(.inf-fuera)') ?? []);
      if (!ms.length) return;
      const linea = innerHeight * 0.4, a = ms[0]!.getBoundingClientRect().top, z = ms[ms.length - 1]!.getBoundingClientRect().bottom;
      raiz.current?.style.setProperty('--p', Math.max(0, Math.min(1, (linea - a) / Math.max(1, z - a))).toFixed(4));
      let k = 0; ms.forEach((m, i) => { if (m.getBoundingClientRect().top <= linea) k = i; });
      setActual(k);
    };
    const pedir = () => { if (!pide) pide = requestAnimationFrame(seguir); };
    addEventListener('scroll', pedir, { passive: true }); addEventListener('resize', pedir); seguir();
    return () => { removeEventListener('scroll', pedir); removeEventListener('resize', pedir); cancelAnimationFrame(pide); };
  }, [listo, incluye]);
  useEffect(() => { const r = rail.current, mi = r?.querySelector<HTMLElement>('.inf-mini.actual'); if (r && mi) r.scrollTo({ top: mi.offsetTop - (r.clientHeight - mi.offsetHeight) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }, [actual]);

  // Las hojas que aún no se han visto entran por filas la primera vez que asoman
  useEffect(() => {
    if (!listo || !pliego.current) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const filas = e.target.querySelectorAll('.a4-cuerpo > *');
      cascada(filas, Math.min(40, 700 / Math.max(1, filas.length)));
    }), { rootMargin: '0px 0px -12% 0px' });
    pliego.current.querySelectorAll('.inf-marco:not(:first-child)').forEach(m => io.observe(m));
    return () => io.disconnect();
  }, [listo]);

  // Qué secciones se imprimen: las hojas entran y salen del pliego y el resto se recoloca (GSAP Flip)
  const alternar = (id: string, si: boolean) => {
    if (raiz.current && !prefersReducedMotion()) antes.current = Flip.getState(raiz.current.querySelectorAll('.inf-marco, .inf-mini'));
    setIncluye(x => ({ ...x, [id]: si }));
  };
  useLayoutEffect(() => {
    const estado = antes.current; antes.current = null;
    if (!estado || !raiz.current) return;
    const el = raiz.current;
    const ctx = gsap.context(() => {
      Flip.from(estado, { targets: el.querySelectorAll('.inf-marco, .inf-mini'), duration: 0.65, ease: CURVA.cambio, absoluteOnLeave: true,
        onEnter: els => gsap.fromTo(els, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.55, ease: CURVA.entrada, clearProps: 'opacity,scale,transform' }),
        onLeave: els => gsap.to(els, { opacity: 0, scale: 0.92, duration: 0.3 }) });
    });
    return () => ctx.revert();
  }, [incluye]);

  // Se imprime siempre el estado final, también si la impresión se lanza desde el menú del navegador
  useEffect(() => { const f = () => terminar.current(); addEventListener('beforeprint', f); return () => removeEventListener('beforeprint', f); }, []);
  const imprimir = () => { terminar.current(); window.print(); };
  const irA = (clave: string) => {
    const m = document.getElementById(`hoja-${clave}`), barra = raiz.current?.querySelector<HTMLElement>('.inf-barra');
    if (m) scrollTo({ top: m.getBoundingClientRect().top + scrollY - (barra ? barra.getBoundingClientRect().bottom : 0) - 20, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <div className={`inf${fase === 'verificando' ? ' verificando' : ''}${fase === 'hecha' && !integ.integra ? ' rota' : ''}${chico ? ' chico' : ''}`} ref={raiz}>
      <header className="inf-cab">
        <p className="sub"><Link className="enlace" to={`/auditorias/${aud.id}/cierre`}>Volver al acta</Link></p>
        <h1 className="inf-tit">Informe de la auditoría n.º {aud.id} · {aud.organizacion}</h1>
        <p className="inf-estado num" role="status"><i aria-hidden="true" />{fase === 'hecha' ? <span>{fraseVerificacion(integ)}</span> : <span ref={cuenta}>Verificando la cadena…</span>}</p>
      </header>

      <div className="inf-barra">
        <div className="inf-barra-in">
          <div className="inf-op" role="group" aria-label="Qué se imprime">
            {secciones.filter(s => s.opcion).map(s => <label className="inf-casilla" key={s.id}><input type="checkbox" checked={incluye[s.id] ?? true} onChange={e => alternar(s.id, e.target.checked)} /> {s.opcion}</label>)}
          </div>
          <div className="inf-acc">
            {listo && <span className="inf-folio num">Página <Rueda valor={Math.min(actual, Math.max(0, total - 1)) + 1} /> de <Rueda valor={total} /></span>}
            <button className="btn" type="button" onClick={imprimir} disabled={!listo}>{integ.integra ? 'Imprimir o guardar PDF' : 'Imprimir como copia no íntegra'}</button>
          </div>
        </div>
        <div className="inf-avance" aria-hidden="true"><i /></div>
      </div>

      {!listo && <Cargando />}
      <div className="inf-cuerpo">
        <nav className="inf-rail" ref={rail} aria-label="Páginas del informe">
          <span className="inf-hilo" aria-hidden="true"><i /></span>
          {hojas.map(h => {
            const n = visibles.indexOf(h);
            return (
              <button key={h.clave} type="button" className={`inf-mini${h.fuera ? ' inf-fuera' : ''}${n === actual ? ' actual' : ''}`} data-flip-id={`m-${h.clave}`} aria-label={`Ir a la página ${n + 1}`} onClick={() => irA(h.clave)}>
                <span className="inf-mini-hoja" aria-hidden="true" /><span className="num">{n + 1} · {h.sec.nombre}</span>
              </button>
            );
          })}
        </nav>
        <div className="inf-pliego" ref={pliego}>
          {hojas.map(h => {
            const n = visibles.indexOf(h) + 1, grande = ampliada === h.clave;
            return (
              <div key={h.clave} id={`hoja-${h.clave}`} className={`inf-marco${h.fuera ? ' inf-fuera' : ''}${grande ? ' zoom' : ''}`} data-flip-id={h.clave}>
                <div className="inf-visor">
                  <Hoja portada={h.sec.id === 'portada'} titulo={titulo} huella={huella} n={n} total={total}>
                    {h.bloques.map(c => bloque(h.sec.bloques[c.bloque]!, c.repetido))}
                  </Hoja>
                </div>
                <button className="inf-lupa" type="button" aria-pressed={grande} onClick={() => setAmpliada(grande ? null : h.clave)}>{grande ? 'Reducir' : 'Ampliar'}</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Aquí se miden los bloques antes de repartirlos en hojas. No se ve, no se imprime y no se lee. */}
      <div className="inf-medidor" ref={medidor} aria-hidden="true">
        {secciones.map(s => <div key={s.id} data-sec={s.id}><Hoja portada={s.id === 'portada'} titulo={titulo} huella={huella} n={1} total={1}>{s.bloques.map(b => bloque(b))}</Hoja></div>)}
      </div>
    </div>
  );
}
