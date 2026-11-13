import type { ReactNode } from 'react';
import type { EstadoAuditoria, EstadoEvaluacion } from '../api/types';
import { ESTADOS_AUDITORIA, NOMBRE_ESTADO } from '../lib/format';

/** Marca de estado de un control: la forma y el color salen del CSS (.marca[data-v]). */
export function Marca({ estado, titulo }: { estado: EstadoEvaluacion; titulo?: string }) {
  return <i className="marca" data-v={estado} title={titulo} aria-hidden="true" />;
}

/** Los cuatro estados de la auditoría con un indicador que se desplaza al estado actual. */
export function Estados({ estado }: { estado: EstadoAuditoria }) {
  return (
    <div className="estados" style={{ '--idx': ESTADOS_AUDITORIA.indexOf(estado) } as React.CSSProperties} role="group" aria-label="Estado de la auditoría">
      <ol>
        {ESTADOS_AUDITORIA.map(e => <li key={e} aria-current={e === estado ? 'step' : undefined}>{NOMBRE_ESTADO[e]}</li>)}
      </ol>
      <span className="estados-marca" />
    </div>
  );
}

export function MensajeError({ children, id }: { children: ReactNode; id?: string }) {
  return <p className="error entra" role="alert" id={id}>{children}</p>;
}

interface CampoProps { id: string; etiqueta: string; error?: string; nota?: string; children: ReactNode }
export function Campo({ id, etiqueta, error, nota, children }: CampoProps) {
  return (
    <div className="campo-w">
      <label htmlFor={id}>{etiqueta}{nota && <small> {nota}</small>}</label>
      {children}
      {error && <p className="campo-error" id={`${id}-err`}>{error}</p>}
    </div>
  );
}

/** Atributos comunes de accesibilidad para un control con posible error. */
export const conError = (id: string, error?: string) => ({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : undefined });
