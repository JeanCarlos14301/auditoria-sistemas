// Geometría del sello de integridad. Solo números: los colores salen de clases y tokens CSS.

export type ClaseEvento = 'EST' | 'EVA' | 'EVI' | 'HAL' | 'REC' | 'CIE';

const CLASE: Record<string, ClaseEvento> = {
  EVALUACION_CONTROL: 'EVA', REGISTRO_EVIDENCIA: 'EVI', REGISTRO_HALLAZGO: 'HAL', REGISTRO_RECOMENDACION: 'REC', CIERRE_INFORME: 'CIE',
};
/** Creación, alcance y cambios de estado son eventos estructurales (EST): los trazos más largos. */
export const claseEvento = (tipoEvento: string): ClaseEvento => CLASE[tipoEvento] ?? 'EST';

export const SELLO = { lado: 240, centro: 120, radioExterior: 112 } as const;
/** Milisegundos entre un trazo y el siguiente cuando el sello en relieve se compone desde cero (para narrarlo a la vez). */
export const PASO_TRAZO = 40;
/** Radio interior del trazo: cuanto menor, más largo. */
export const RADIO_INTERIOR: Record<ClaseEvento, number> = { EST: 94, EVA: 100, EVI: 105, HAL: 105, REC: 105, CIE: 90 };
/** Radio base de cada una de las tres curvas de la roseta. */
export const radioBase = (curva: number): number => 50 + curva * 8;

const TAU = Math.PI * 2;

/**
 * Radios de las tres curvas de la roseta para un hash, muestreados en `puntos` + 1 ángulos.
 * El mismo hash produce siempre la misma forma; hashes distintos, formas distintas.
 * Trabajar con radios (y no con el trazo ya dibujado) permite pasar de una forma a otra interpolando.
 */
export function radiosDe(hashHex: string, puntos = 360): number[][] {
  const b = (hashHex.match(/[0-9a-f]{2}/gi) ?? []).map(h => parseInt(h, 16));
  if (b.length < 12) return [];
  return [0, 1, 2].map(j => {
    const petalos = 6 + (b[j]! % 10), modulacion = 3 + (b[j + 3]! % 5), amplitud = 4 + (b[j + 6]! % 6), fase = (b[j + 9]! / 255) * TAU, radio = radioBase(j);
    return Array.from({ length: puntos + 1 }, (_, i) => { const t = (i / puntos) * TAU; return radio + amplitud * Math.sin(petalos * t + fase) * Math.cos(modulacion * t); });
  });
}
/** La roseta sin hash: tres círculos. */
export const radiosLisos = (puntos = 360): number[][] => [0, 1, 2].map(j => new Array<number>(puntos + 1).fill(radioBase(j)));

/** Convierte los radios de una curva en el atributo `d` de un <path> cerrado. */
export function trazoDe(radios: ArrayLike<number>): string {
  const C = SELLO.centro, n = radios.length - 1;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * TAU, r = radios[i]!;
    d += `${i ? 'L' : 'M'}${(C + r * Math.cos(t)).toFixed(1)} ${(C + r * Math.sin(t)).toFixed(1)}`;
  }
  return `${d}Z`;
}

/** Las tres curvas de la roseta de un hash, listas para dibujar. */
export const rosetaDe = (hashHex: string): string[] => radiosDe(hashHex).map(trazoDe);
