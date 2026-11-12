// Geometría del sello de integridad. Solo números: los colores salen de clases y tokens CSS.

export type ClaseEvento = 'EST' | 'EVA' | 'EVI' | 'HAL' | 'REC' | 'CIE';

const CLASE: Record<string, ClaseEvento> = {
  EVALUACION_CONTROL: 'EVA', REGISTRO_EVIDENCIA: 'EVI', REGISTRO_HALLAZGO: 'HAL', REGISTRO_RECOMENDACION: 'REC', CIERRE_INFORME: 'CIE',
};
/** Creación, alcance y cambios de estado son eventos estructurales (EST): los trazos más largos. */
export const claseEvento = (tipoEvento: string): ClaseEvento => CLASE[tipoEvento] ?? 'EST';

export const SELLO = { lado: 240, centro: 120, radioExterior: 112 } as const;
/** Radio interior del trazo: cuanto menor, más largo. */
export const RADIO_INTERIOR: Record<ClaseEvento, number> = { EST: 94, EVA: 100, EVI: 105, HAL: 105, REC: 105, CIE: 90 };

/**
 * Tres curvas cerradas cuya forma depende de los bytes del hash final: cada auditoría tiene un dibujo distinto,
 * y el mismo hash siempre produce el mismo dibujo. Devuelve el atributo `d` de cada <path>.
 */
export function rosetaDe(hashHex: string): string[] {
  const b = (hashHex.match(/[0-9a-f]{2}/gi) ?? []).map(h => parseInt(h, 16));
  if (b.length < 12) return [];
  const C = SELLO.centro, TAU = Math.PI * 2;
  return [0, 1, 2].map(j => {
    const petalos = 6 + (b[j]! % 10), modulacion = 3 + (b[j + 3]! % 5), amplitud = 4 + (b[j + 6]! % 6), fase = (b[j + 9]! / 255) * TAU, radio = 50 + j * 8;
    let d = '';
    for (let i = 0; i <= 360; i++) {
      const t = (i / 360) * TAU, r = radio + amplitud * Math.sin(petalos * t + fase) * Math.cos(modulacion * t);
      d += `${i ? 'L' : 'M'}${(C + r * Math.cos(t)).toFixed(1)} ${(C + r * Math.sin(t)).toFixed(1)}`;
    }
    return `${d}Z`;
  });
}
