import { describe, expect, it } from 'vitest';
import { repartir, type Medida } from './paginar';

const b = (alto: number, extra: Partial<Medida> = {}): Medida => ({ alto, margen: 10, ...extra });
const indices = (hojas: ReturnType<typeof repartir>) => hojas.map(h => h.map(x => (x.repetido ? `r${x.bloque}` : `${x.bloque}`)));

describe('repartir', () => {
  it('deja todo en una hoja si cabe', () => {
    expect(indices(repartir([b(40), b(40), b(40)], 200))).toEqual([['0', '1', '2']]);
  });

  it('el primer bloque de cada hoja no gasta su margen', () => {
    // 100 + (10 + 90) = 200 justo; el tercero abre hoja
    expect(indices(repartir([b(100), b(90), b(90)], 200))).toEqual([['0', '1'], ['2']]);
    // con un punto menos de alto ya no cabe el segundo
    expect(indices(repartir([b(100), b(90)], 199))).toEqual([['0'], ['1']]);
  });

  it('un título no se queda solo al final de la hoja', () => {
    const hojas = repartir([b(150), b(20, { pegado: true }), b(60)], 200);
    expect(indices(hojas)).toEqual([['0'], ['1', '2']]);
  });

  it('repite la cabecera cuando la tabla continúa en otra hoja', () => {
    const tabla = [b(20, { pegado: true }), b(15, { pegado: true, cabecera: true }), ...Array.from({ length: 6 }, () => b(30, { margen: 0, fila: true }))];
    const hojas = repartir(tabla, 130);
    // título (20) + cabecera (10 + 15) + 2 filas (60) = 105; la tercera no cabe
    expect(indices(hojas)).toEqual([['0', '1', '2', '3'], ['r1', '4', '5', '6'], ['r1', '7']]);
  });

  it('si no cabe ni la primera fila, título y cabecera se van con ella sin repetirse', () => {
    const hojas = repartir([b(150), b(20, { pegado: true }), b(15, { pegado: true, cabecera: true }), b(30, { margen: 0, fila: true })], 200);
    expect(indices(hojas)).toEqual([['0'], ['1', '2', '3']]);
  });

  it('deja de repetir la cabecera cuando la tabla ha terminado', () => {
    const hojas = repartir([b(15, { pegado: true, cabecera: true }), b(30, { fila: true }), b(100), b(100)], 170);
    expect(indices(hojas)).toEqual([['0', '1', '2'], ['3']]);
  });

  it('coloca solo un bloque más alto que la hoja en vez de perderlo', () => {
    expect(indices(repartir([b(50), b(500), b(50)], 200))).toEqual([['0'], ['1'], ['2']]);
  });

  it('no pierde ni duplica bloques', () => {
    const medidas = Array.from({ length: 57 }, (_, i) => b(17 + (i * 7) % 40, { pegado: i % 9 === 0 }));
    const vistos = repartir(medidas, 300).flat().filter(x => !x.repetido).map(x => x.bloque);
    expect(vistos).toEqual(medidas.map((_, i) => i));
  });
});
