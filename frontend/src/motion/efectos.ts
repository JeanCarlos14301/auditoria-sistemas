// Gestos de movimiento reutilizables. Reglas: solo transform y opacity; el JS nunca toca colores;
// con movimiento reducido no hacen nada y el elemento queda en su estado final.
import { animate as animar, stagger } from 'animejs';
import { animate as resorte } from 'motion';
import { prefersReducedMotion } from './motion';

export const RESORTE = { type: 'spring', stiffness: 420, damping: 32 } as const;

/** Error: el elemento se sacude con un resorte que arranca con velocidad (Motion). */
export function sacudir(el: Element | null): void {
  if (el && !prefersReducedMotion()) resorte(el, { x: [-12, 0] }, { type: 'spring', stiffness: 900, damping: 10, velocity: 900 });
}

/** Algo acaba de ocurrir aquí: el elemento brinca hasta su tamaño. */
export function brincar(el: Element | null, desde = 0.6): void {
  if (el && !prefersReducedMotion()) resorte(el, { scale: [desde, 1] }, { type: 'spring', stiffness: 520, damping: 13 });
}

/** Entrada escalonada de una lista (anime.js stagger). Al terminar retira sus estilos en línea. */
export function cascada(els: Element[] | NodeListOf<Element>, paso = 45): void {
  const lista = Array.from(els);
  if (!lista.length || prefersReducedMotion()) return;
  // No se usa revert(): si se llama dos veces sobre los mismos elementos, la segunda devolvería el estado inicial de la primera
  const limpiar = () => lista.forEach(el => { const st = (el as HTMLElement).style; st.removeProperty('opacity'); st.removeProperty('transform'); });
  animar(lista, { opacity: [0, 1], y: [16, 0], duration: 700, ease: 'outExpo', delay: stagger(paso), onComplete: limpiar });
}

/**
 * Mueve el indicador de un grupo de pestañas hasta el elemento activo con un resorte.
 * Por defecto, en horizontal y para los grupos de chips; `eje: 'y'` lo mueve en vertical (índice de un documento).
 */
export function moverIndicador(grupo: HTMLElement | null, conResorte: boolean, activoSel = '[aria-pressed="true"]', indSel = '.chip-ind', eje: 'x' | 'y' = 'x'): void {
  if (!grupo) return;
  const ind = grupo.querySelector<HTMLElement>(indSel), activo = grupo.querySelector<HTMLElement>(activoSel);
  if (!ind || !activo) return;
  const destino = eje === 'x' ? { x: activo.offsetLeft, width: activo.offsetWidth } : { y: activo.offsetTop, height: activo.offsetHeight };
  resorte(ind, destino, conResorte && !prefersReducedMotion() ? RESORTE : { duration: 0 });
}
