import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { onSesionPerdida, tokenStore } from '../api/client';
import * as ep from '../api/endpoints';
import type { Usuario } from '../api/types';

type Estado = { fase: 'cargando' } | { fase: 'anonima' } | { fase: 'activa'; usuario: Usuario };
interface Sesion { estado: Estado; entrar: (email: string, password: string) => Promise<void>; salir: () => void }

const Ctx = createContext<Sesion | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<Estado>(() => (tokenStore.get() ? { fase: 'cargando' } : { fase: 'anonima' }));

  const salir = useCallback(() => { tokenStore.clear(); qc.clear(); setEstado({ fase: 'anonima' }); }, [qc]);

  // Cualquier 401 de la API cierra la sesión (el cliente ya ha borrado el token).
  useEffect(() => { onSesionPerdida(() => { qc.clear(); setEstado({ fase: 'anonima' }); }); return () => onSesionPerdida(null); }, [qc]);

  // Al recargar la página, la sesión se restaura con GET /auth/me.
  useEffect(() => {
    if (!tokenStore.get()) return;
    let vivo = true;
    ep.yo().then(usuario => { if (vivo) setEstado({ fase: 'activa', usuario }); }, () => { if (vivo) { tokenStore.clear(); setEstado({ fase: 'anonima' }); } });
    return () => { vivo = false; };
  }, []);

  const entrar = useCallback(async (email: string, password: string) => {
    const s = await ep.login(email, password);
    tokenStore.set(s.token);
    setEstado({ fase: 'activa', usuario: s.usuario });
  }, []);

  const valor = useMemo(() => ({ estado, entrar, salir }), [estado, entrar, salir]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion(): Sesion {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSesion debe usarse dentro de <AuthProvider>');
  return s;
}

/** Envuelve las rutas privadas: sin sesión, lleva al login recordando a dónde se quería ir. */
export function RutaPrivada() {
  const { estado } = useSesion();
  const loc = useLocation();
  if (estado.fase === 'cargando') return <p className="wrap sub" style={{ paddingBlock: 48 }}>Recuperando la sesión…</p>;
  if (estado.fase === 'anonima') return <Navigate to="/login" replace state={{ desde: loc.pathname }} />;
  return <Outlet />;
}
