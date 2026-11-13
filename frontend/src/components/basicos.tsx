import type { ReactNode } from 'react';
import type { EstadoEvaluacion } from '../api/types';

/** Marca de estado de un control: la forma y el color salen del CSS (.marca[data-v]). PEND: todavía sin evaluar. */
export function Marca({ estado, titulo }: { estado: EstadoEvaluacion | 'PEND'; titulo?: string }) {
  return <i className="marca" data-v={estado} title={titulo} aria-hidden="true" />;
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
