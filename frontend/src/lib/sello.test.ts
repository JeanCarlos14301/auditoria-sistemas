import { describe, expect, it } from 'vitest';
import { claseEvento, rosetaDe } from './sello';

const H1 = '0dd4148daba2f9216a374c27887c7d23c2246b5313f15a423c39dbefae8cf41a';
const H2 = '26db6dc45bd90b04f5b22df1a941729ce6838ae8f0cb6fb88ef1785ca01c48ec';

describe('rosetaDe', () => {
  it('es determinista: el mismo hash da el mismo dibujo', () => { expect(rosetaDe(H1)).toEqual(rosetaDe(H1)); });
  it('hashes distintos dan dibujos distintos', () => { expect(rosetaDe(H1)).not.toEqual(rosetaDe(H2)); });
  it('devuelve tres curvas cerradas dentro del sello', () => {
    const curvas = rosetaDe(H1);
    expect(curvas).toHaveLength(3);
    for (const d of curvas) {
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      for (const n of d.match(/-?\d+\.\d/g)!.map(Number)) { expect(n).toBeGreaterThan(30); expect(n).toBeLessThan(210); }
    }
  });
  it('sin hash válido no dibuja nada', () => { expect(rosetaDe('')).toEqual([]); });
});

describe('claseEvento', () => {
  it('clasifica los eventos de la bitácora', () => {
    expect(claseEvento('REGISTRO_EVIDENCIA')).toBe('EVI');
    expect(claseEvento('CIERRE_INFORME')).toBe('CIE');
    expect(claseEvento('CAMBIO_ESTADO')).toBe('EST');
    expect(claseEvento('CREACION_AUDITORIA')).toBe('EST');
  });
});
