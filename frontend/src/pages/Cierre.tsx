import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuditoria } from '../api/queries';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { Acta } from './Acta';
import { Revision } from './Revision';

export default function Cierre() {
  const id = Number(useParams().id);
  const q = useAuditoria(id);
  /** Si ya estaba cerrada al llegar, se va directa al acta; si se cierra aquí, se espera a que la hoja se selle. */
  const cerradaAlLlegar = useRef<boolean | null>(null);
  const [sellada, setSellada] = useState(false);
  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  if (q.data.auditoria.estado === 'BORRADOR') return (
    <div className="prosa">
      <p><b>Esta auditoría está en Borrador.</b> No hay nada que revisar hasta que se defina su alcance.</p>
      <p><Link className="enlace" to="/auditorias">Volver a las auditorías</Link></p>
    </div>
  );
  if (cerradaAlLlegar.current === null) cerradaAlLlegar.current = q.data.auditoria.estado === 'CERRADA';
  if (q.data.auditoria.estado === 'CERRADA' && (cerradaAlLlegar.current || sellada)) return <Acta id={id} datos={q.data} />;
  return <Revision id={id} datos={q.data} onSellada={() => setSellada(true)} />;
}

