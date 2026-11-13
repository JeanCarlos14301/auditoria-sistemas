import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuditoria, useInforme, useIntegridad } from '../api/queries';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { Historia } from '../components/Historia';
import { textoOrla } from '../components/Sello';
import { pct } from '../lib/format';

/** La historia de la auditoría, en su propia pestaña: la bitácora se reproduce eslabón a eslabón. */
export default function HistoriaPagina() {
  const id = Number(useParams().id);
  const q = useAuditoria(id);
  const cerrada = q.data?.auditoria.estado === 'CERRADA';
  const integ = useIntegridad(id, true);
  const informe = useInforme(id, cerrada);
  const nombres = useMemo(() => Object.fromEntries((q.data?.evaluaciones ?? []).map(e => [e.control.codigo_iso, e.control.nombre])), [q.data]);
  if (q.isPending || integ.isPending || (cerrada && informe.isPending)) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  if (integ.isError) return <ErrorPagina error={integ.error} />;
  if (q.data.auditoria.estado === 'BORRADOR') return <Navigate to={`/auditorias/${id}`} replace />;
  const inf = informe.data?.informe;
  return (
    <Historia eslabones={integ.data.eslabones} nombres={nombres} titulo={`Historia de la auditoría n.º ${id}`}
      cifra={inf ? pct(Number(inf.cumplimiento_pct)) : ''} orla={textoOrla(integ.data, inf ? inf.fecha_generacion.slice(0, 10) : null)} />
  );
}
