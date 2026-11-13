// El viaje de la hoja nueva a la cabecera: al crear una auditoría, su título, su alcance, las fases y las pestañas
// pasan de donde se escribieron a su sitio en la cabecera. Las piezas se marcan con data-viaje en las dos pantallas.
import { CURVA, gsap } from './gsap';
import { prefersReducedMotion } from './motion';

export const PIEZAS = ['rot', 'org', 'alc', 'fases', 'pest'] as const;
type Pieza = (typeof PIEZAS)[number];
export interface Viaje { t: number; desde: Partial<Record<Pieza, { left: number; top: number }>> }

/** Anota dónde está cada pieza antes de cambiar de pantalla. */
export function medirViaje(raiz: HTMLElement | null): Viaje {
  const desde: Viaje['desde'] = {};
  PIEZAS.forEach(k => { const el = raiz?.querySelector(`[data-viaje="${k}"]`); if (el) { const r = el.getBoundingClientRect(); desde[k] = { left: r.left, top: r.top }; } });
  return { t: Date.now(), desde };
}

/** El viaje que trae el estado de la navegación, solo si es de hace un momento (el historial lo conserva al recargar). */
export function viajeReciente(state: unknown): Viaje | null {
  const v = (state as { viaje?: Viaje } | null)?.viaje;
  return v && Date.now() - v.t < 4000 ? v : null;
}

/** Cada pieza parte de donde estaba en la hoja nueva y llega a su sitio. Devuelve false si no hay viaje que hacer. */
export function viajar(raiz: HTMLElement | null, v: Viaje | null): boolean {
  if (!raiz || !v || prefersReducedMotion()) return false;
  PIEZAS.forEach(k => {
    const el = raiz.querySelector<HTMLElement>(`[data-viaje="${k}"]`), o = v.desde[k];
    if (!el || !o) return;
    const r = el.getBoundingClientRect();
    gsap.from(el, { x: o.left - r.left, y: o.top - r.top, duration: 0.65, ease: CURVA.cambio, clearProps: 'transform' });
  });
  return true;
}
