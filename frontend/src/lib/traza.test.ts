import { describe, expect, it } from 'vitest';
import { nodosDe, tramosVivos, trazaCompleta } from './traza';

const ev = (estado: Parameters<typeof nodosDe>[0]['estado'], evidencias = 0, recsPorHallazgo: number[] = []) =>
  ({ estado, evidencias: Array(evidencias).fill(0), hallazgos: recsPorHallazgo.map(n => ({ recomendaciones: Array(n).fill(0) })) });

describe('nodosDe', () => {
  it('implementado con evidencia: traza completa', () => {
    const t = nodosDe(ev('IMPLEMENTADO', 1));
    expect(t).toEqual(['ok', 'no', 'no']);
    expect(trazaCompleta(t)).toBe(true);
  });
  it('CP-06: implementado sin evidencia corta la línea en el primer tramo', () => {
    const t = nodosDe(ev('IMPLEMENTADO', 0));
    expect(t).toEqual(['falta', 'no', 'no']);
    expect(tramosVivos(t)).toEqual([false, false, false]);
  });
  it('no implementado sin hallazgo: falta el hallazgo y la recomendación queda pendiente', () => {
    const t = nodosDe(ev('NO_IMPLEMENTADO'));
    expect(t).toEqual(['no', 'falta', 'pend']);
    expect(tramosVivos(t)).toEqual([true, false, false]);
  });
  it('CP-08: hallazgo sin recomendación corta la línea en el último tramo', () => {
    const t = nodosDe(ev('PARCIALMENTE_IMPLEMENTADO', 0, [0]));
    expect(t).toEqual(['no', 'ok', 'falta']);
    expect(tramosVivos(t)).toEqual([true, true, false]);
  });
  it('varios hallazgos: basta uno sin recomendación para que falte', () => {
    expect(nodosDe(ev('NO_IMPLEMENTADO', 0, [2, 0]))[2]).toBe('falta');
    expect(trazaCompleta(nodosDe(ev('NO_IMPLEMENTADO', 0, [1, 3])))).toBe(true);
  });
  it('no aplica: la línea pasa de largo', () => {
    const t = nodosDe(ev('NO_APLICABLE'));
    expect(t).toEqual(['no', 'no', 'no']);
    expect(trazaCompleta(t)).toBe(true);
  });
  it('la evidencia en un control parcial es opcional pero se dibuja', () => {
    expect(nodosDe(ev('PARCIALMENTE_IMPLEMENTADO', 2, [1]))).toEqual(['ok', 'ok', 'ok']);
  });
});
