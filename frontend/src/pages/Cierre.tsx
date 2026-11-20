import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuditoria } from '../api/queries';
import { Cargando, ErrorPagina } from '../components/estados-pagina';
import { Acta } from './Acta';
import { Revision } from './Revision';

export default function Cierre() {
  const id = Number(useParams().id);
  const q = useAuditoria(id);
  /** Cerrada, se ve el acta; si se está cerrando desde aquí, se espera a que la hoja se selle. Así, si la cierra
   *  otra persona u otra pestaña mientras se revisa, la recarga lleva al acta en lugar de dejar la revisión a medias. */
  const [cerrando, setCerrando] = useState(false);
  const [sellada, setSellada] = useState(false);
  if (q.isPending) return <Cargando />;
  if (q.isError) return <ErrorPagina error={q.error} />;
  if (q.data.auditoria.estado === 'BORRADOR') return (
    <div className="prosa">
      <p><b>Esta auditoría está en Borrador.</b> No hay nada que revisar hasta que se defina su alcance.</p>
      <p><Link className="enlace" to="/auditorias">Volver a las auditorías</Link></p>
    </div>
  );
  if (q.data.auditoria.estado === 'CERRADA' && (!cerrando || sellada)) return <Acta id={id} datos={q.data} />;
  return <Revision id={id} datos={q.data} onCerrando={setCerrando} onSellada={() => setSellada(true)} />;
}

