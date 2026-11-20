import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { animate as resorte } from 'motion';
import type { Usuario } from '../api/types';
import { ponerTema, temaGuardado, type Tema } from '../lib/tema';
import { moverIndicador } from '../motion/efectos';
import { prefersReducedMotion } from '../motion/motion';

const ROL: Record<Usuario['rol'], string> = { auditor: 'Auditor', admin: 'Administrador' };
const TEMAS: readonly [Tema, string][] = [['', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']];
/** Las iniciales, de las dos primeras palabras del nombre que da la API. */
const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('');

const Salir = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" /><path d="M10.5 11 13.5 8l-3-3M13.5 8H6" />
  </svg>
);

/**
 * La cuenta en la barra: solo las iniciales y el rol, para que la ruta tenga sitio. Al pulsarlas se abre un panel con
 * el nombre completo, el correo, el tema y «Cerrar sesión». Se cierra con Escape, pulsando fuera o con el mismo botón.
 */
export function Cuenta({ usuario, onSalir }: { usuario: Usuario; onSalir: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [tema, setTema] = useState<Tema>(temaGuardado);
  const raiz = useRef<HTMLDivElement>(null), boton = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), chips = useRef<HTMLDivElement>(null);
  const id = useId(), rol = ROL[usuario.rol] ?? usuario.rol, ini = iniciales(usuario.nombre);

  const cerrar = (devolverFoco: boolean) => { setAbierto(false); if (devolverFoco) boton.current?.focus(); };
  // Escape o un clic fuera lo cierran
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(true); };
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) cerrar(false); };
    addEventListener('keydown', tecla); document.addEventListener('pointerdown', fuera);
    return () => { removeEventListener('keydown', tecla); document.removeEventListener('pointerdown', fuera); };
  }, [abierto]);
  // Al abrir: el panel crece desde el botón (resorte), el indicador del tema se coloca y el foco entra en él
  useLayoutEffect(() => {
    if (!abierto || !panel.current) return;
    moverIndicador(chips.current, false);
    if (!prefersReducedMotion()) resorte(panel.current, { opacity: [0, 1], scale: [0.96, 1], y: [-6, 0] }, { type: 'spring', stiffness: 520, damping: 34 });
    chips.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, [abierto]);
  useLayoutEffect(() => { if (abierto) moverIndicador(chips.current, true); }, [tema, abierto]);

  const elegir = (t: Tema) => { setTema(t); ponerTema(t); };

  return (
    <div className="cuenta" ref={raiz}>
      <button className="cuenta-btn" type="button" ref={boton} aria-expanded={abierto} aria-controls={id} aria-label={`Tu cuenta: ${usuario.nombre}, ${rol}`} onClick={() => (abierto ? cerrar(true) : setAbierto(true))}>
        <span className="cuenta-ini" aria-hidden="true">{ini}</span>
        <span className="cuenta-rol-txt" aria-hidden="true">{rol}</span>
        <svg className="cuenta-flecha" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {abierto && (
        <div className="cuenta-panel" id={id} ref={panel} role="dialog" aria-label="Tu cuenta">
          <div className="cuenta-cab">
            <span className="cuenta-ini grande" aria-hidden="true">{ini}</span>
            <b>{usuario.nombre}</b>
            <span className="cuenta-mail">{usuario.email}</span>
            <span className="cuenta-rol">{rol}</span>
          </div>
          <div className="cuenta-sec">
            <p className="rot" id={`${id}-tema`}>Tema</p>
            <div className="chips" ref={chips} role="group" aria-labelledby={`${id}-tema`}>
              <span className="chip-ind" aria-hidden="true" />
              {TEMAS.map(([t, nombre]) => <button key={nombre} className="chip" type="button" aria-pressed={t === tema} onClick={() => elegir(t)}>{nombre}</button>)}
            </div>
          </div>
          <div className="cuenta-sec">
            <button className="cuenta-salir" type="button" onClick={onSalir}><Salir />Cerrar sesión</button>
            <p className="cuenta-nota">La sesión también se cierra al cerrar la pestaña.</p>
          </div>
        </div>
      )}
    </div>
  );
}
