import { Link } from 'react-router-dom';
import type { ApiError } from '../api/client';

/** Mientras llegan los datos, la página se dibuja como una hoja en blanco: título, cifras y filas en borrador. */
export const Cargando = () => (
  <div className="esqueleto" role="status" aria-label="Cargando">
    <span className="esq-tit" />
    <span className="esq-cifras">{[0, 1, 2, 3].map(i => <i key={i} />)}</span>
    {[0, 1, 2].map(k => <span className="esq-fila" key={k} style={{ '--k': k } as React.CSSProperties}><i /><i /></span>)}
  </div>
);

/** 404 de la API: no existe o no pertenece al usuario (la API no distingue, a propósito). */
export function ErrorPagina({ error }: { error: ApiError }) {
  const noEncontrada = error.status === 404;
  return (
    <div className="prosa">
      <h1 className="titulo-pagina">{noEncontrada ? 'Auditoría no encontrada' : 'No se pudo cargar'}</h1>
      <p>{noEncontrada ? 'No existe o no tienes acceso a ella.' : error.message}</p>
      <p><Link className="enlace" to="/auditorias">Volver a las auditorías</Link></p>
    </div>
  );
}
