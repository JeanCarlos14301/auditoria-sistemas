import type { CuerpoError } from './types';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/+$/, '');
const CLAVE = 'audita.token';

/** El token vive en sessionStorage: sobrevive a recargar la página y muere al cerrar la pestaña. */
export const tokenStore = {
  get(): string | null { try { return sessionStorage.getItem(CLAVE); } catch { return null; } },
  set(token: string): void { try { sessionStorage.setItem(CLAVE, token); } catch { /* sin almacenamiento: la sesión dura lo que la página */ } },
  clear(): void { try { sessionStorage.removeItem(CLAVE); } catch { /* nada que limpiar */ } },
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: CuerpoError;
  constructor(status: number, body: CuerpoError) {
    super(body.error);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
  /** Errores de validación por campo, cuando la API envía details como [{campo, mensaje}]. */
  get porCampo(): Record<string, string> {
    const d = this.body.details;
    if (!Array.isArray(d)) return {};
    const out: Record<string, string> = {};
    for (const x of d) if (x && typeof x.campo === 'string' && typeof x.mensaje === 'string') out[x.campo] = x.mensaje;
    return out;
  }
}

let alPerderSesion: (() => void) | null = null;
/** La sesión se registra aquí para enterarse de cualquier 401 (API.md: borrar el token e ir al login). */
export function onSesionPerdida(fn: (() => void) | null): void { alPerderSesion = fn; }

interface Opciones { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; publica?: boolean }

export async function api<T>(ruta: string, { method = 'GET', body, publica = false }: Opciones = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token && !publica) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(BASE + ruta, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { error: 'No se pudo conectar con la API. Comprueba que el backend está en marcha.', code: 'NETWORK' });
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) return json as T;

  const cuerpo: CuerpoError = json && typeof (json as CuerpoError).error === 'string' ? (json as CuerpoError) : { error: `La API respondió ${res.status}.` };
  if (res.status === 401 && !publica) { tokenStore.clear(); alPerderSesion?.(); }
  throw new ApiError(res.status, cuerpo);
}
