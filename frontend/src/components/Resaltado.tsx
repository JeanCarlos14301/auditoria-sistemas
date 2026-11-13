import type { ReactNode } from 'react';

/** Sin tildes ni mayúsculas, para buscar como se escribe. */
export const normal = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Resalta la primera coincidencia con la búsqueda. */
export function Resaltado({ texto, q }: { texto: string; q: string }): ReactNode {
  const i = q ? normal(texto).indexOf(normal(q)) : -1;
  if (i < 0) return texto;
  return <>{texto.slice(0, i)}<mark>{texto.slice(i, i + q.length)}</mark>{texto.slice(i + q.length)}</>;
}
