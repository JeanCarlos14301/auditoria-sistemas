// El tema de la interfaz: el del sistema (por defecto) o uno elegido por el usuario, que se recuerda en este navegador.
// tokens.css ya lo admite: data-theme="light" | "dark" en <html> fuerza uno; sin él, manda prefers-color-scheme.
export type Tema = '' | 'light' | 'dark';
const CLAVE = 'audita.tema';

export function temaGuardado(): Tema {
  try { const t = localStorage.getItem(CLAVE); return t === 'light' || t === 'dark' ? t : ''; } catch { return ''; }
}

export function ponerTema(t: Tema): void {
  const raiz = document.documentElement;
  if (t) raiz.dataset.theme = t; else delete raiz.dataset.theme;
  try { if (t) localStorage.setItem(CLAVE, t); else localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento: vale para esta visita */ }
}
