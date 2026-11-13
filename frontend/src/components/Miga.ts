import { createContext, useContext } from 'react';

/** Dónde está el usuario dentro de una auditoría: lo muestra la barra de documento. */
export interface Miga { id: number; organizacion: string; vista: string }
export interface ControlMiga {
  poner(m: Miga | null): void;
  /** El título grande de la auditoría salió de la pantalla: su nombre pasa a la barra. */
  nombreFuera(si: boolean): void;
}
export const MigaContext = createContext<ControlMiga>({ poner() {}, nombreFuera() {} });
export const useMiga = (): ControlMiga => useContext(MigaContext);
