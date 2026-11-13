// Base del sistema de movimiento.
// Reglas: el JS solo escribe progreso (--p), índices y clases; el CSS deriva transformaciones y opacidades.
// El JS nunca toca colores. En movimiento continuo solo cambian transform y opacity.

/** Curva de entrada (fuerte) y curva de cambio de estado. Las mismas viven en tokens.css como --e-in y --e-st. */
export const EASE = { entrada: 'cubic-bezier(.16,1,.3,1)', estado: 'cubic-bezier(.66,0,.1,1)' } as const;

const consulta = (q: string): boolean => typeof matchMedia === 'function' && matchMedia(q).matches;
export const prefersReducedMotion = (): boolean => consulta('(prefers-reduced-motion: reduce)');
export const hasFinePointer = (): boolean => consulta('(hover: hover) and (pointer: fine)');
export const isNarrow = (): boolean => typeof innerWidth === 'number' && innerWidth < 760;
/** Coreografías largas (pin, parallax): solo sin movimiento reducido y en pantallas anchas. */
export const canChoreograph = (): boolean => !prefersReducedMotion() && !isNarrow();

/**
 * Lleva un valor de `de` a `a` en `ms` milisegundos, de forma lineal, y lo entrega en cada fotograma.
 * Con movimiento reducido salta al final. Devuelve una función para cancelarlo.
 */
export function tween(de: number, a: number, ms: number, paso: (v: number) => void, fin?: () => void): () => void {
  if (prefersReducedMotion() || ms <= 0 || typeof requestAnimationFrame !== 'function') { paso(a); fin?.(); return () => {}; }
  let raf = 0;
  const t0 = performance.now();
  const cuadro = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    paso(de + (a - de) * k);
    if (k < 1) raf = requestAnimationFrame(cuadro); else fin?.();
  };
  raf = requestAnimationFrame(cuadro);
  return () => cancelAnimationFrame(raf);
}

/** Reinicia una animación CSS de entrada (clase .entra) sobre un elemento que ya existe. */
export function reentrar(el: HTMLElement | null): void {
  if (!el) return;
  el.classList.remove('entra');
  void el.offsetWidth;
  el.classList.add('entra');
}
