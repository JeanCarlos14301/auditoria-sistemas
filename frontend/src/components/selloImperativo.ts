// Sello animable fuera de React: se usa donde el sello cambia muchas veces por segundo
// (la entrada, que reproduce una bitácora en bucle, y la historia, que sigue al scroll).
// Solo cambia clases, atributos de geometría y transformaciones; los colores son del CSS (sello.css).
import { animate as animar, type JSAnimation } from 'animejs';
import { animate as resorte } from 'motion';
import { RADIO_INTERIOR, SELLO, claseEvento, radiosDe, radiosLisos, trazoDe } from '../lib/sello';
import { prefersReducedMotion } from '../motion/motion';

export interface SelloImperativo {
  /** Enciende los k primeros trazos. */
  hasta(k: number): void;
  /** Lleva la roseta a la forma de un hash (o a tres círculos si es null), interpolando. */
  forma(hash: string | null, ms?: number): void;
  /** Muestra u oculta el centro (cifra, lema y orla). `fuerte` añade el golpe del estampado. */
  sellar(si: boolean, fuerte?: boolean): void;
  /** Marca la cadena como rota en una posición (1 = primer eslabón), o íntegra con null. */
  romper(posicion: number | null): void;
  textos(cifra: string, orla: string): void;
  destruir(): void;
}

const PUNTOS = 180;
let serie = 0;

export function crearSello(el: HTMLElement, tipos: readonly string[]): SelloImperativo {
  const n = tipos.length, C = SELLO.centro, id = `sv-orla-${++serie}`;
  el.classList.add('sv');
  el.innerHTML = `<svg viewBox="0 0 ${SELLO.lado} ${SELLO.lado}" role="img" aria-label="Sello de integridad">`
    + `<defs><path id="${id}" d="M${C} ${C} m-84 0 a84 84 0 1 1 168 0 a84 84 0 1 1 -168 0"/></defs>`
    + tipos.map((t, i) => { const c = claseEvento(t); return `<line class="sv-tick t-${c} off" x1="${C}" x2="${C}" y1="${C - SELLO.radioExterior}" y2="${C - RADIO_INTERIOR[c]}" style="transform:rotate(${((i / n) * 360).toFixed(2)}deg)"/>`; }).join('')
    + `<g class="sv-roseta"><path/><path/><path/></g><circle class="sv-disco" cx="${C}" cy="${C}" r="37"/>`
    + `<text class="sv-orla"><textPath href="#${id}" textLength="520"></textPath></text>`
    + `<text class="sv-pct" x="${C}" y="${C + 5}"></text><text class="sv-lema" x="${C}" y="${C + 20}">ÍNTEGRA</text></svg>`;
  const ticks = Array.from(el.querySelectorAll<SVGLineElement>('.sv-tick'));
  const curvas = Array.from(el.querySelectorAll<SVGPathElement>('.sv-roseta path'));
  const orla = el.querySelector('textPath')!, cifra = el.querySelector('.sv-pct')!, lema = el.querySelector('.sv-lema')!;
  const actual = radiosLisos(PUNTOS);
  const dibujar = () => actual.forEach((r, j) => curvas[j]!.setAttribute('d', trazoDe(r)));
  let anim: JSAnimation | null = null, formaDe = '';
  dibujar();

  return {
    hasta(k) { ticks.forEach((t, i) => t.classList.toggle('off', i >= k)); },
    forma(hash, ms = 200) {
      if ((hash ?? '') === formaDe) return;
      formaDe = hash ?? '';
      anim?.pause();
      const destino = hash ? radiosDe(hash, PUNTOS) : radiosLisos(PUNTOS);
      if (!destino.length) return;
      const origen = actual.map(r => [...r]), o = { t: 0 };
      const pintar = () => { actual.forEach((r, j) => { for (let i = 0; i <= PUNTOS; i++) r[i] = origen[j]![i]! + (destino[j]![i]! - origen[j]![i]!) * o.t; }); dibujar(); };
      if (prefersReducedMotion() || ms <= 0) { o.t = 1; pintar(); return; }
      // anime.js mueve un objeto plano; en cada fotograma se vuelve a dibujar la roseta
      anim = animar(o, { t: 1, duration: ms, ease: 'outQuad', onUpdate: pintar, onComplete: pintar });
    },
    sellar(si, fuerte = false) {
      const antes = el.classList.contains('sellado');
      el.classList.toggle('sellado', si);
      if (si && !antes && fuerte && !prefersReducedMotion()) resorte(el, { scale: [1.22, 1], rotate: [-9, 0] }, { type: 'spring', stiffness: 380, damping: 12 });
    },
    romper(posicion) {
      ticks.forEach((t, i) => { t.classList.toggle('tras', posicion !== null && i + 1 > posicion); t.classList.toggle('ruptura', posicion !== null && i + 1 === posicion); });
      el.classList.toggle('rota', posicion !== null);
      lema.textContent = posicion !== null ? 'NO ÍNTEGRA' : 'ÍNTEGRA';
    },
    textos(c, o) { cifra.textContent = c; orla.textContent = o; },
    destruir() { anim?.pause(); el.innerHTML = ''; el.classList.remove('sv', 'sellado', 'rota'); },
  };
}
