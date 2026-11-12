/**
 * Serialización JSON canónica (determinista), inspirada en RFC 8785 (JCS):
 *  - Claves de objeto ordenadas lexicográficamente por punto de código UTF-16.
 *  - Sin espacios en blanco.
 *  - Números con la serialización de ECMAScript (la que exige JCS).
 *  - Se rechazan valores no representables de forma estable (NaN, Infinity, BigInt,
 *    funciones, símbolos) para que el mismo dato produzca SIEMPRE el mismo hash.
 *  - `Date` se serializa como ISO-8601 UTC.
 *  - Propiedades con valor `undefined` se omiten (igual que JSON.stringify).
 */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | Date
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue | undefined };

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalizationError';
  }
}

export function canonicalize(value: unknown): string {
  return serialize(value, '$', new WeakSet());
}

function serialize(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError(`Número no finito en ${path}`);
      }
      // -0 y 0 deben producir la misma salida.
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    case 'object':
      break;
    default:
      throw new CanonicalizationError(`Tipo no serializable (${typeof value}) en ${path}`);
  }

  const obj = value as object;

  if (obj instanceof Date) {
    if (Number.isNaN(obj.getTime())) throw new CanonicalizationError(`Fecha inválida en ${path}`);
    return JSON.stringify(obj.toISOString());
  }

  if (seen.has(obj)) throw new CanonicalizationError(`Referencia circular en ${path}`);
  seen.add(obj);

  let out: string;
  if (Array.isArray(obj)) {
    out = `[${obj.map((item, i) => serialize(item === undefined ? null : item, `${path}[${i}]`, seen)).join(',')}]`;
  } else {
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      throw new CanonicalizationError(`Solo se admiten objetos planos (${path})`);
    }
    const record = obj as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const v = record[key];
      if (v === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${serialize(v, `${path}.${key}`, seen)}`);
    }
    out = `{${parts.join(',')}}`;
  }

  seen.delete(obj);
  return out;
}
