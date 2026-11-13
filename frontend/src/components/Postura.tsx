import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate as animar, stagger } from 'animejs';
import type { ControlISO, Evaluacion } from '../api/types';
import { NOMBRE_EVALUACION } from '../lib/format';
import { sinEvaluar } from '../lib/traza';
import { moverIndicador } from '../motion/efectos';
import { CURVA, Flip, gsap } from '../motion/gsap';
import { prefersReducedMotion } from '../motion/motion';
import { Marca } from './basicos';

type Clave = 'categoria_tema' | 'attr_tipo_control' | 'attr_propiedades_cia' | 'attr_concepto_nist' | 'attr_dominio_seguridad';
// Los atributos con que ISO/IEC 27002:2022 etiqueta cada control. `orden` fija el orden natural de sus valores.
const ATRIBUTOS: readonly { clave: Clave; nombre: string; orden?: readonly string[] }[] = [
  { clave: 'categoria_tema', nombre: 'Cláusula' },
  { clave: 'attr_tipo_control', nombre: 'Tipo de control', orden: ['Preventivo', 'Detectivo', 'Correctivo'] },
  { clave: 'attr_propiedades_cia', nombre: 'Propiedad', orden: ['Confidencialidad', 'Integridad', 'Disponibilidad'] },
  { clave: 'attr_concepto_nist', nombre: 'Concepto NIST', orden: ['Identificar', 'Proteger', 'Detectar', 'Responder', 'Recuperar'] },
  { clave: 'attr_dominio_seguridad', nombre: 'Dominio' },
];

interface Ficha { ev: Evaluacion; id: string }

/** Agrupa las evaluaciones por los valores de un atributo. Un control con varios valores entra en cada uno de sus grupos. */
function agrupar(evaluaciones: readonly Evaluacion[], clave: Clave, orden?: readonly string[]): [string, Ficha[]][] {
  const grupos = new Map<string, Ficha[]>();
  orden?.forEach(v => grupos.set(v, []));
  for (const ev of evaluaciones) {
    String((ev.control as ControlISO)[clave] ?? '').split(',').map(s => s.trim()).filter(Boolean).forEach((valor, j) => {
      if (!grupos.has(valor)) grupos.set(valor, []);
      grupos.get(valor)!.push({ ev, id: `${ev.id}-${j}` });
    });
  }
  return [...grupos].filter(([, fichas]) => fichas.length > 0);
}

/**
 * La postura por atributo: los controles de la auditoría, reagrupados según el atributo ISO que se elija.
 * Al cambiar de atributo, cada control viaja de su grupo anterior al nuevo (GSAP Flip).
 * Las cifras de cada grupo son recuentos de lo que se ve, no una métrica nueva.
 */
export function Postura({ evaluaciones }: { evaluaciones: readonly Evaluacion[] }) {
  const [indice, setIndice] = useState(0);
  const cont = useRef<HTMLDivElement>(null), chips = useRef<HTMLDivElement>(null);
  const antes = useRef<Flip.FlipState | null>(null);
  const atributo = ATRIBUTOS[indice]!;
  const grupos = useMemo(() => agrupar(evaluaciones, atributo.clave, atributo.orden), [evaluaciones, atributo]);

  const elegir = (i: number) => {
    if (i === indice) return;
    // Se anota dónde está cada ficha antes de que React las recoloque
    if (cont.current && !prefersReducedMotion()) antes.current = Flip.getState(cont.current.querySelectorAll('.tile'));
    setIndice(i);
  };

  useLayoutEffect(() => {
    moverIndicador(chips.current, antes.current !== null);
    const estado = antes.current, el = cont.current;
    antes.current = null;
    if (!estado || !el) return;
    const ctx = gsap.context(() => {
      Flip.from(estado, { targets: el.querySelectorAll('.tile'), duration: 0.75, ease: CURVA.cambio, stagger: 0.012, onEnter: els => gsap.fromTo(els, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.45, delay: 0.25, ease: CURVA.entrada }) });
      gsap.from(el.querySelectorAll('.grupo h3, .grupo > p'), { opacity: 0, y: 8, duration: 0.45, stagger: 0.025, ease: CURVA.entrada });
    });
    return () => ctx.revert();
  }, [indice]);

  // Entrada: onda en rejilla desde el centro (anime.js stagger con grid y from: 'center')
  useEffect(() => {
    const el = cont.current;
    if (!el) return;
    const ro = new ResizeObserver(() => moverIndicador(chips.current, false));
    if (chips.current) ro.observe(chips.current);
    const io = new IntersectionObserver(([x]) => {
      if (!x!.isIntersecting) return;
      io.disconnect();
      if (prefersReducedMotion()) return;
      const fichas = Array.from(el.querySelectorAll('.tile')), cols = Math.ceil(Math.sqrt(fichas.length * 2));
      animar(fichas, { opacity: [0, 1], scale: [0.3, 1], duration: 800, ease: 'outExpo', delay: stagger(55, { grid: [cols, Math.ceil(fichas.length / cols)], from: 'center' }), onComplete: self => { self.revert(); } });
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); ro.disconnect(); };
  }, []);

  return (
    <section className="hoja postura" aria-labelledby="postura-t">
      <div>
        <h2 className="titulo-seccion" id="postura-t">Postura por atributo</h2>
        <p className="sub">Los controles de esta auditoría, agrupados por los atributos de ISO/IEC 27002:2022. Un control con varios valores aparece en cada uno.</p>
      </div>
      <div className="chips" ref={chips} role="group" aria-label="Agrupar por">
        <span className="chip-ind" aria-hidden="true" />
        {ATRIBUTOS.map((a, i) => <button key={a.clave} className="chip" type="button" aria-pressed={i === indice} onClick={() => elegir(i)}>{a.nombre}</button>)}
      </div>
      <div className="grupos" ref={cont}>
        {grupos.map(([valor, fichas]) => (
          <div className="grupo" key={valor}>
            <h3>{valor}</h3>
            <p className="sub num">{fichas.filter(f => f.ev.estado === 'IMPLEMENTADO').length} de {fichas.length} implementados</p>
            <div className="tiles">
              {fichas.map(({ ev, id }) => (
                <span className="tile" key={id} data-flip-id={`c${id}`} title={`${ev.control.nombre}: ${sinEvaluar(ev) ? 'Por evaluar' : NOMBRE_EVALUACION[ev.estado]}`}>
                  <Marca estado={sinEvaluar(ev) ? 'PEND' : ev.estado} /><span className="num">{ev.control.codigo_iso}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
