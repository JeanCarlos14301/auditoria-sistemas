import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useSesion } from '../auth/AuthContext';
import { CURVA, gsap } from '../motion/gsap';
import { prefersReducedMotion } from '../motion/motion';
import { MigaContext, type ControlMiga, type Miga } from './Miga';

/**
 * Marco común de las pantallas privadas: la página es papel a todo el ancho, como la portada de la entrada.
 * Arriba, la barra de documento dice dónde está el usuario (Auditorías / n.º 7 · Organización / vista);
 * abajo, el pie del documento. Las pantallas de una auditoría ponen su ruta con useMiga().
 */
export function Marco() {
  const { estado, salir } = useSesion();
  const loc = useLocation();
  const [miga, setMiga] = useState<Miga | null>(null);
  const [fuera, setFuera] = useState(false);
  const control = useMemo<ControlMiga>(() => ({ poner: setMiga, nombreFuera: setFuera }), []);
  const regla = useRef<HTMLElement>(null);
  const enLista = loc.pathname === '/auditorias', enNueva = loc.pathname === '/auditorias/nueva';

  // Al entrar en la aplicación, la regla de la barra se traza como la de la portada
  useEffect(() => {
    if (!prefersReducedMotion() && regla.current) gsap.fromTo(regla.current, { scaleX: 0 }, { scaleX: 1, duration: 1, ease: CURVA.cambio, clearProps: 'transform' });
  }, []);

  return (
    <MigaContext.Provider value={control}>
      <header className={`barra${miga && fuera ? ' con-nombre' : ''}`}>
        <div className="marco">
          <div className="barra-in">
            <Link className="logo" to="/auditorias">AuditA</Link>
            <nav className="miga" aria-label="Estás en">
              <Link to="/auditorias" aria-current={enLista ? 'page' : undefined}>Auditorías</Link>
              {miga && (
                <>
                  <span className="sep" aria-hidden="true">/</span>
                  <span className="miga-aud"><span className="num">n.º {miga.id}</span><span className="miga-org">{' · '}{miga.organizacion}</span></span>
                  <span className="sep sep-vista" aria-hidden="true">/</span><span className="miga-vista" aria-current="page">{miga.vista}</span>
                </>
              )}
              {enNueva && <><span className="sep" aria-hidden="true">/</span><span className="miga-vista" aria-current="page">Nueva auditoría</span></>}
            </nav>
            {estado.fase === 'activa' && (
              <div className="barra-usuario">
                <span className="sub">{estado.usuario.nombre}</span>
                <button className="enlace" type="button" onClick={salir}>Salir</button>
              </div>
            )}
          </div>
          <i className="regla" ref={regla} aria-hidden="true" />
        </div>
      </header>
      <main className="marco pagina"><Outlet /></main>
      <footer className="pie-doc marco">
        <i className="regla fina" aria-hidden="true" />
        <div className="pie-doc-t"><span>AuditA · ISO/IEC 27002:2022 · ISO 19011:2018</span><span>Bitácora encadenada con HMAC-SHA256</span></div>
      </footer>
    </MigaContext.Provider>
  );
}
