import { useEffect } from 'react';

/** El título de la pestaña dice qué se está viendo. */
export function useTitulo(titulo: string): void {
  useEffect(() => { document.title = titulo; }, [titulo]);
}
