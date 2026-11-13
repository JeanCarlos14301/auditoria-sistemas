import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../motion/motion';
import { crearSello } from './selloImperativo';

interface Props {
  /** Bitácora que se reproduce: tipo de evento y hash de cada eslabón. */
  cadena: readonly { t: string; h: string }[];
  cifra: string;
  orla: string;
  /** Al pasar a true, el sello deja el bucle y se estampa con fuerza. */
  fijo: boolean;
}

/**
 * El sello componiéndose en directo: un trazo por evento, y la roseta cambia de forma con cada hash
 * porque cada eslabón depende del anterior. Al llegar al cierre se estampa, espera y vuelve a empezar.
 * El bucle solo corre a la vista y con la pestaña activa; con movimiento reducido aparece compuesto y quieto.
 */
export function SelloVivo({ cadena, cifra, orla, fijo }: Props) {
  const caja = useRef<HTMLDivElement>(null), rotulo = useRef<HTMLParagraphElement>(null);
  const fijar = useRef<() => void>(() => {});

  useEffect(() => {
    const el = caja.current, txt = rotulo.current;
    if (!el || !txt) return;
    const N = cadena.length, sello = crearSello(el, cadena.map(e => e.t));
    const st = { i: 0, timer: 0, visible: false, fijo: false, corriendo: false };
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    sello.textos(cifra, orla);
    const rotular = (i: number) => { const e = cadena[i]!; txt.innerHTML = `Eslabón <b>${i + 1}</b> de ${N} · ${e.t}<br><span class="hash">${e.h.slice(0, 24)}…</span>`; };
    const final = () => { clearTimeout(st.timer); st.corriendo = false; sello.hasta(N); sello.forma(cadena[N - 1]!.h, 0); sello.sellar(true); txt.innerHTML = `Bitácora de ejemplo: <b>${N}</b> eslabones<br><span class="hash">${cadena[N - 1]!.h.slice(0, 24)}…</span>`; };
    const vaciar = () => { sello.sellar(false); sello.hasta(0); sello.forma(null, 500); st.i = 0; };
    const paso = () => {
      if (!st.corriendo) return;
      if (st.i < N) { sello.hasta(st.i + 1); sello.forma(cadena[st.i]!.h, 210); rotular(st.i); st.i++; st.timer = window.setTimeout(paso, st.i === N ? 520 : 230); }
      else { sello.sellar(true, true); st.timer = window.setTimeout(() => { vaciar(); st.timer = window.setTimeout(paso, 900); }, 4200); }
    };
    const sincronizar = () => {
      if (st.fijo || prefersReducedMotion()) { final(); return; }
      const debe = st.visible && !document.hidden;
      if (debe && !st.corriendo) { st.corriendo = true; if (el.classList.contains('sellado')) vaciar(); st.timer = window.setTimeout(paso, 300); }
      else if (!debe && st.corriendo) { st.corriendo = false; clearTimeout(st.timer); }
    };
    fijar.current = () => { st.fijo = true; final(); if (!prefersReducedMotion()) { sello.sellar(false); void el.getBoundingClientRect(); sello.sellar(true, true); } };
    const io = new IntersectionObserver(([e]) => { st.visible = e!.isIntersecting; sincronizar(); }, { threshold: 0.2 });
    io.observe(el);
    document.addEventListener('visibilitychange', sincronizar);
    mq.addEventListener('change', sincronizar);
    return () => { clearTimeout(st.timer); io.disconnect(); document.removeEventListener('visibilitychange', sincronizar); mq.removeEventListener('change', sincronizar); sello.destruir(); };
  }, [cadena, cifra, orla]);

  useEffect(() => { if (fijo) fijar.current(); }, [fijo]);

  return (
    <div className="vivo">
      <div ref={caja} />
      <p className="ticker num" ref={rotulo} aria-hidden="true" />
    </div>
  );
}
