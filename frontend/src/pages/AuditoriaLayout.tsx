import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuditoria } from '../api/queries';
import { CabeceraAuditoria } from '../components/CabeceraAuditoria';
import { Cargando, ErrorPagina } from '../components/estados-pagina';

/**
 * Contenedor de las pantallas de una auditoría: pinta su cabecera una sola vez y, debajo, la vista de la pestaña.
 * Las vistas leen el mismo detalle (GET /auditorias/:id), que TanStack Query comparte desde la caché.
 */
export default function AuditoriaLayout() {
  const id = Number(useParams().id);
  const valido = Number.isInteger(id) && id > 0;
  const q = useAuditoria(id);
  if (!valido) return <Navigate to="/auditorias" replace />;
  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  return (
    <div className="aud">
      <CabeceraAuditoria datos={q.data} />
      <div className="aud-vista"><Outlet /></div>
    </div>
  );
}
