import { Link } from 'react-router-dom';
import type { ApiError } from '../api/client';

export const Cargando = () => <p className="sub" role="status">Cargando…</p>;

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
