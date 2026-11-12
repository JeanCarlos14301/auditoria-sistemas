import { Link, Outlet } from 'react-router-dom';
import { useSesion } from '../auth/AuthContext';

/** Marco de las pantallas privadas: marca, usuario y salida. */
export function Marco() {
  const { estado, salir } = useSesion();
  return (
    <>
      <header className="barra">
        <div className="wrap">
          <Link className="logo" to="/auditorias">AuditA</Link>
          {estado.fase === 'activa' && (
            <div className="barra-usuario">
              <span className="sub">{estado.usuario.nombre}</span>
              <button className="enlace" type="button" onClick={salir}>Salir</button>
            </div>
          )}
        </div>
      </header>
      <main className="wrap pagina"><Outlet /></main>
    </>
  );
}
