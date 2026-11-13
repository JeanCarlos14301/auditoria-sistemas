import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Escena, OpcionesRelieve } from './relieve/escena';

interface Props {
  tipos: readonly string[];
  hashFinal: string;
  cifra: string;
  orla: string;
  /** Posición del eslabón roto (1 = el primero), o null si la cadena está íntegra. */
  ruptura: number | null;
  /** Al cambiar, el relieve se vuelve a componer desde cero (por ejemplo, tras verificar de nuevo). */
  pulso?: number;
  /** Clase extra para la caja (por ejemplo, para que ocupe un panel entero en vez de un cuadrado). */
  className?: string;
  /** Qué parte del lado corto ocupa el sello. Ver OpcionesRelieve. */
  encuadre?: OpcionesRelieve['encuadre'];
  /** Zona donde la luz sigue al puntero; por defecto, la caja del sello. */
  zona?: RefObject<HTMLElement>;
  inclinacion?: number;
  /** El relieve ya está a la vista y empieza a componerse (no se llama si se queda el sello plano). */
  onListo?: () => void;
  /** El sello plano: se muestra mientras three.js se descarga y se queda si no hay WebGL. */
  children: ReactNode;
}

/** Lo que una página puede pedirle al relieve. Sin WebGL, no hace nada. */
export interface ControlRelieve {
  estampar(): Promise<void>;
  luzDesde(x: number, y: number): void;
}

/**
 * El sello en relieve. three.js (unos 125 KB comprimidos) se descarga solo cuando este componente
 * está a punto de entrar en pantalla. Si la descarga o WebGL fallan, el sello plano se queda
 * y el resto de la página sigue funcionando.
 */
export const SelloRelieve = forwardRef<ControlRelieve, Props>(function SelloRelieve(
  { tipos, hashFinal, cifra, orla, ruptura, pulso = 0, className, encuadre, zona, inclinacion, onListo, children }, ref,
) {
  const caja = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const escena = useRef<Escena | null>(null);
  const [listo, setListo] = useState(false);
  const primera = useRef(true);
  const datos = useRef({ ruptura, orla });
  datos.current = { ruptura, orla };
  // Opciones y aviso, leídos al crear la escena: cambiarlos después no la reconstruye
  const opciones = useRef({ encuadre, zona, inclinacion, onListo });
  opciones.current = { encuadre, zona, inclinacion, onListo };

  useImperativeHandle(ref, () => ({
    estampar: () => escena.current?.estampar() ?? Promise.resolve(),
    luzDesde: (x, y) => escena.current?.luzDesde(x, y),
  }), []);

  useEffect(() => {
    const el = caja.current, lienzo = canvas.current;
    if (!el || !lienzo) return;
    let vivo = true, cargando = false;
    const cargar = async () => {
      if (cargando || escena.current) return;
      cargando = true;
      try {
        const [{ crearEscena }] = await Promise.all([import('./relieve/escena'), document.fonts?.ready]);
        if (!vivo) return;
        const o = opciones.current;
        const e = crearEscena(lienzo, el, { tipos, hashFinal, cifra, orla: datos.current.orla, lema: datos.current.ruptura === null ? 'ÍNTEGRA' : 'NO ÍNTEGRA' },
          { encuadre: o.encuadre, zona: o.zona?.current ?? undefined, inclinacion: o.inclinacion });
        if (datos.current.ruptura !== null) e.ruptura(datos.current.ruptura, datos.current.orla, 'NO ÍNTEGRA');
        escena.current = e; primera.current = true; setListo(true);
        e.visible(true); e.animar(true);
        o.onListo?.();
      } catch { /* sin WebGL o sin red: se queda el sello plano */ }
    };
    const cerca = new IntersectionObserver(([x]) => { if (x!.isIntersecting) void cargar(); }, { rootMargin: '500px 0px' });
    const vista = new IntersectionObserver(([x]) => { escena.current?.visible(x!.isIntersecting); }, { threshold: 0.05 });
    cerca.observe(el); vista.observe(el);
    // El color del papel sale de los tokens: se relee cuando cambia el tema
    const mq = matchMedia('(prefers-color-scheme: dark)'), alTema = () => escena.current?.tema();
    mq.addEventListener('change', alTema);
    const mo = new MutationObserver(alTema); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { vivo = false; cerca.disconnect(); vista.disconnect(); mq.removeEventListener('change', alTema); mo.disconnect(); escena.current?.destruir(); escena.current = null; };
  }, [tipos, hashFinal, cifra]);

  // La verificación cambia: el relieve se hunde desde el eslabón roto, o vuelve a levantarse
  useEffect(() => {
    const e = escena.current;
    if (!e || !listo) return;
    // La primera vez ya lo ha compuesto la carga
    if (primera.current) { primera.current = false; return; }
    e.ruptura(ruptura, orla, ruptura === null ? 'ÍNTEGRA' : 'NO ÍNTEGRA'); e.animar(false);
  }, [ruptura, orla, listo]);

  useEffect(() => { if (pulso > 0) escena.current?.animar(true); }, [pulso]);

  return (
    <div className={`relieve${className ? ` ${className}` : ''}`} ref={caja}>
      <canvas ref={canvas} hidden={!listo} aria-hidden="true" />
      <div className="relieve-plano" hidden={listo}>{children}</div>
    </div>
  );
});
