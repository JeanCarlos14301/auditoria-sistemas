// Reparte bloques de contenido en hojas de alto fijo. Solo números: quien lo usa mide los bloques en el DOM.

export interface Medida {
  /** Alto del bloque, sin márgenes. */
  alto: number;
  /** Margen superior. Se pierde cuando el bloque abre hoja. */
  margen: number;
  /** No se separa del bloque siguiente (un título, la cabecera de una tabla). */
  pegado?: boolean;
  /** Cabecera de tabla: se repite cuando sus filas continúan en otra hoja. */
  cabecera?: boolean;
  /** Fila de la tabla cuya cabecera es la última vista. */
  fila?: boolean;
}

export interface Colocado {
  /** Índice del bloque en la lista medida. */
  bloque: number;
  /** Es una cabecera repetida al continuar la tabla, no el bloque original. */
  repetido?: true;
}

/**
 * Llena cada hoja hasta que el siguiente bloque no cabe. Reglas:
 * un bloque `pegado` nunca queda el último de una hoja (se va con el siguiente),
 * y si una tabla se parte, la hoja nueva empieza repitiendo su cabecera.
 * Un bloque más alto que la hoja se coloca igualmente, solo, para no perder contenido.
 */
export function repartir(medidas: readonly Medida[], altoUtil: number): Colocado[][] {
  const hojas: Colocado[][] = [[]];
  const coste = (i: number, abreHoja: boolean) => medidas[i]!.alto + (abreHoja ? 0 : medidas[i]!.margen);
  let usado = 0, cabecera: number | null = null;

  medidas.forEach((m, i) => {
    if (m.cabecera) cabecera = i; else if (!m.fila && !m.pegado) cabecera = null;
    const hoja = hojas[hojas.length - 1]!;
    const c = coste(i, hoja.length === 0);
    if (hoja.length === 0 || usado + c <= altoUtil + 0.5) { hoja.push({ bloque: i }); usado += c; return; }

    // No cabe: abre hoja y se lleva los bloques pegados que tenía justo antes
    const arrastra: Colocado[] = [];
    while (hoja.length > 1) {
      const ultimo = hoja[hoja.length - 1]!;
      if (ultimo.repetido || !medidas[ultimo.bloque]!.pegado) break;
      arrastra.unshift(hoja.pop()!);
    }
    const nueva: Colocado[] = [];
    if (m.fila && cabecera !== null && arrastra.length === 0) nueva.push({ bloque: cabecera, repetido: true });
    nueva.push(...arrastra, { bloque: i });
    hojas.push(nueva);
    usado = nueva.reduce((s, x, k) => s + coste(x.bloque, k === 0), 0);
  });
  return hojas;
}
