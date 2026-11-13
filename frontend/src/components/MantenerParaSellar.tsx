import { useEffect, useRef, type ReactNode } from 'react';
import { animate as resorte } from 'motion';
import { prefersReducedMotion } from '../motion/motion';

interface Props {
  etiqueta: ReactNode;
  disabled?: boolean;
  /** Progreso del gesto, de 0 a 1, en cada fotograma. */
  onProgreso: (h: number) => void;
  /** El gesto llegó al final. */
  onCompleto: () => void;
  /** Al cambiar, el progreso vuelve a cero con un resorte (por ejemplo, si la API rechaza la acción). */
  reinicio: number;
}

const MS = 1500;

/**
 * Botón para acciones sin vuelta atrás: hay que mantenerlo pulsado.
 * Si se suelta antes, el progreso retrocede con un resorte que hereda la velocidad del gesto y no pasa nada.
 * Funciona con puntero y con espacio o Intro mantenidos. Con movimiento reducido el gesto dura lo mismo
 * (es la salvaguarda, no un adorno): solo desaparece el resorte de vuelta. Quien no pueda mantener una
 * pulsación necesita otra vía, así que quien lo use debe ofrecer además una confirmación alternativa.
 */
export function MantenerParaSellar({ etiqueta, disabled, onProgreso, onCompleto, reinicio }: Props) {
  const boton = useRef<HTMLButtonElement>(null);
  const st = useRef({ h: 0, raf: 0, vel: 0, hecho: false, vuelta: null as { stop: () => void } | null });
  const fns = useRef({ onProgreso, onCompleto });
  fns.current = { onProgreso, onCompleto };

  const pinta = (v: number) => { st.current.h = v; boton.current?.style.setProperty('--h', v.toFixed(4)); fns.current.onProgreso(v); };

  const empezar = () => {
    const s = st.current;
    if (s.hecho || disabled) return;
    s.vuelta?.stop(); s.vuelta = null;
    const desde = s.h, t0 = performance.now(); let tPrev = t0;
    const cuadro = (t: number) => {
      const v = Math.min(1, desde + (t - t0) / MS);
      s.vel = ((v - s.h) / Math.max(1, t - tPrev)) * 1000; tPrev = t;
      pinta(v);
      if (v < 1) s.raf = requestAnimationFrame(cuadro); else { s.hecho = true; fns.current.onCompleto(); }
    };
    s.raf = requestAnimationFrame(cuadro);
  };
  const volver = (velocidad: number) => {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    if (s.h <= 0) return;
    if (prefersReducedMotion()) { pinta(0); return; }
    s.vuelta = resorte(s.h, 0, { type: 'spring', stiffness: 160, damping: 20, velocity: velocidad, onUpdate: v => pinta(Math.max(0, Math.min(1, v))) });
  };
  const soltar = () => { if (!st.current.hecho) volver(st.current.vel); };

  // La acción falló después de completarse el gesto: el botón vuelve a estar disponible
  useEffect(() => { if (reinicio > 0) { st.current.hecho = false; volver(0); } }, [reinicio]); // solo al cambiar `reinicio`
  useEffect(() => () => { cancelAnimationFrame(st.current.raf); st.current.vuelta?.stop(); }, []);

  return (
    <button
      ref={boton} type="button" className="btn hold" disabled={disabled}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); empezar(); }}
      onPointerUp={soltar} onPointerCancel={soltar} onLostPointerCapture={soltar}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); empezar(); } }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') soltar(); }}
      onContextMenu={e => e.preventDefault()}
    >
      <span>{etiqueta}</span>
    </button>
  );
}
