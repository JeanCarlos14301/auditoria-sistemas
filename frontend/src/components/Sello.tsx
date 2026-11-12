import { useMemo } from 'react';
import type { VerificacionIntegridad } from '../api/types';
import { RADIO_INTERIOR, SELLO, claseEvento, rosetaDe } from '../lib/sello';

interface Props {
  /** Eventos de la bitácora, en orden. El anillo tiene un trazo por evento. */
  eslabones: readonly { id: number; tipo_evento: string }[];
  /** Resultado de la verificación; decide el texto de la orla, la roseta y, si la cadena está rota, dónde. */
  verificacion: Pick<VerificacionIntegridad, 'integra' | 'algoritmo' | 'hash_final' | 'cadena'> | null;
  /** Cifra del centro, ya formateada (el cumplimiento sellado en el informe). */
  cifra: string | null;
  /** Fecha de cierre YYYY-MM-DD para la orla. */
  fechaCierre: string | null;
  /** Eslabón recién añadido, para resaltarlo un momento. */
  idNuevo: number | null;
}

/**
 * Sello de integridad. Su geometría sale de los datos: un trazo por eslabón (el largo depende del tipo de evento)
 * y una roseta generada con el hash final. Cuánto está "compuesto" lo decide el CSS a partir de --p, heredado de .acta.
 */
export function Sello({ eslabones, verificacion, cifra, fechaCierre, idNuevo }: Props) {
  const n = eslabones.length;
  const C = SELLO.centro;
  const rota = verificacion ? !verificacion.integra : false;
  const ruptura = rota ? verificacion!.cadena.ruptura : null;
  const roseta = useMemo(() => (verificacion && fechaCierre ? rosetaDe(verificacion.hash_final) : []), [verificacion, fechaCierre]);
  const orla = !verificacion ? ''
    : ruptura ? `CADENA ALTERADA · RUPTURA EN EL ESLABÓN ${ruptura.posicion} DE ${verificacion.cadena.total_eslabones} · ${ruptura.motivo} · `
    : `AUDITA · ${verificacion.algoritmo} · ${verificacion.cadena.total_eslabones} ESLABONES · ISO/IEC 27002:2022${fechaCierre ? ` · ${fechaCierre}` : ''} · `;

  return (
    <div className={`sello${rota ? ' rota' : ''}`}>
      <svg viewBox={`0 0 ${SELLO.lado} ${SELLO.lado}`} role="img" aria-label={rota ? 'Sello de integridad: cadena alterada' : `Sello de integridad: ${n} eslabones en la bitácora`}>
        <defs><path id="sello-orla" d={`M${C} ${C} m-84 0 a84 84 0 1 1 168 0 a84 84 0 1 1 -168 0`} /></defs>
        {eslabones.map((e, i) => {
          const tipo = claseEvento(e.tipo_evento), pos = i + 1;
          const cls = `tick t-${tipo}${e.id === idNuevo ? ' nuevo' : ''}${ruptura && pos > ruptura.posicion ? ' tras' : ''}${ruptura && pos === ruptura.posicion ? ' ruptura' : ''}`;
          // Todos los trazos se dibujan arriba y se giran a su sitio: al llegar un evento nuevo, el anillo se reparte solo con transform.
          return <line key={e.id} className={cls} x1={C} x2={C} y1={C - SELLO.radioExterior} y2={C - RADIO_INTERIOR[tipo]} style={{ '--k': i / n, transform: `rotate(${(i / n) * 360}deg)` } as React.CSSProperties}><title>{`#${pos} ${e.tipo_evento}`}</title></line>;
        })}
        <g className="roseta">{roseta.map((d, i) => <path key={i} d={d} />)}</g>
        <circle className="disco" cx={C} cy={C} r={37} />
        <text className="orla"><textPath href="#sello-orla" textLength={520}>{orla}</textPath></text>
        <text className="pct" x={C} y={C + 5}>{cifra}</text>
        <text className="lema" x={C} y={C + 20}>{rota ? 'NO ÍNTEGRA' : 'ÍNTEGRA'}</text>
      </svg>
    </div>
  );
}
