import { Link } from 'react-router-dom';
import { useAuditorias } from '../api/queries';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { NOMBRE_ESTADO, fecha, pct } from '../lib/format';

// Listado funcional mínimo para poder entrar a una auditoría: el panel (RF09) está pendiente de mockup.
export default function Auditorias() {
  const q = useAuditorias();
  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  return (
    <>
      <h1 className="titulo-pagina">Auditorías</h1>
      {q.data.length === 0 ? <p className="sub">Todavía no hay auditorías.</p> : (
        <ul className="reg listado">
          {q.data.map(a => (
            <li key={a.id}>
              <Link to={`/auditorias/${a.id}`}>{a.organizacion}</Link>
              <span className="meta num">{fecha(a.fecha_inicio)} – {fecha(a.fecha_fin)} · {a.auditor_nombre} · {NOMBRE_ESTADO[a.estado]}{a.estado !== 'BORRADOR' && ` · ${pct(Number(a.cumplimiento_pct))}`}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
