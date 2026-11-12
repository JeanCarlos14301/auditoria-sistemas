import { useEffect, useRef, useState } from 'react';
import { tween } from './motion';

interface Props { valor: number; formato: (n: number) => string; decimales?: number; ms?: number; className?: string }

/**
 * Muestra una cifra que cuenta desde el valor anterior hasta el nuevo.
 * El último fotograma escribe exactamente `valor`, que es el que envía la API: nunca se recalcula ni se redondea de más.
 */
export function CountUp({ valor, formato, decimales = 1, ms = 600, className }: Props) {
  const [visto, setVisto] = useState(valor);
  const anterior = useRef(valor);
  useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    if (de === valor) { setVisto(valor); return; }
    const f = 10 ** decimales;
    return tween(0, 1, ms, t => { const e = 1 - (1 - t) ** 4; setVisto(Math.round((de + (valor - de) * e) * f) / f); }, () => setVisto(valor));
  }, [valor, decimales, ms]);
  return <span className={className}>{formato(visto)}</span>;
}
