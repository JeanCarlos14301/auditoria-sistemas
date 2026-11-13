import { describe, expect, it } from 'vitest';
import { fraseDe, reproducir, trazaEnElTiempo, type EventoBitacora } from './historia';

const ev = (tipo_evento: string, payload: object): EventoBitacora => ({ tipo_evento, payload_canonico: JSON.stringify(payload), hash_actual: 'a'.repeat(64), timestamp_utc: '2026-11-12T21:22:40.000Z' });
const pct = (n: number) => `${n} %`;

const BITACORA = [
  ev('CREACION_AUDITORIA', { estado: 'BORRADOR', organizacion: 'X' }),
  ev('ALCANCE_DEFINIDO', { codigos_iso: ['5.1', '8.8'], estado_nuevo: 'EN_EJECUCION', total_controles: 2 }),
  ev('EVALUACION_CONTROL', { codigo_iso: '5.1', estado: 'IMPLEMENTADO' }),
  ev('REGISTRO_EVIDENCIA', { codigo_iso: '5.1' }),
  ev('EVALUACION_CONTROL', { codigo_iso: '8.8', estado: 'NO_IMPLEMENTADO' }),
  ev('REGISTRO_HALLAZGO', { codigo_iso: '8.8', id_hallazgo: 7, severidad: 'ALTA' }),
  ev('REGISTRO_RECOMENDACION', { id_hallazgo: 7 }),
  ev('CAMBIO_ESTADO', { estado_nuevo: 'EN_REVISION' }),
  ev('CIERRE_INFORME', { estado_nuevo: 'CERRADA', cumplimiento_pct: 50 }),
];

describe('reproducir', () => {
  const s = reproducir(BITACORA);
  it('da una instantánea más que eventos, y la primera está vacía', () => {
    expect(s).toHaveLength(BITACORA.length + 1);
    expect(s[0]).toEqual({ estado: null, controles: {}, toca: null });
  });
  it('sigue el estado de la auditoría', () => {
    expect([s[1]!.estado, s[2]!.estado, s[8]!.estado, s[9]!.estado]).toEqual(['BORRADOR', 'EN_EJECUCION', 'EN_REVISION', 'CERRADA']);
  });
  it('los controles entran al definir el alcance, sin evaluar', () => {
    expect(Object.keys(s[2]!.controles)).toEqual(['5.1', '8.8']);
    expect(s[2]!.controles['5.1']!.estado).toBeNull();
    expect(trazaEnElTiempo(s[2]!.controles['5.1'])).toEqual(['pend', 'no', 'no']);
  });
  it('la traza de un control implementado se completa al llegar su evidencia', () => {
    expect(trazaEnElTiempo(s[3]!.controles['5.1'])).toEqual(['falta', 'no', 'no']);
    expect(trazaEnElTiempo(s[4]!.controles['5.1'])).toEqual(['ok', 'no', 'no']);
  });
  it('la recomendación se asigna al control de su hallazgo', () => {
    expect(trazaEnElTiempo(s[6]!.controles['8.8'])).toEqual(['no', 'ok', 'falta']);
    expect(s[7]!.toca).toBe('8.8');
    expect(trazaEnElTiempo(s[7]!.controles['8.8'])).toEqual(['no', 'ok', 'ok']);
  });
  it('cada instantánea es independiente: rebobinar no ve cambios posteriores', () => {
    expect(s[3]!.controles['5.1']!.evidencias).toBe(0);
    expect(s[9]!.controles['5.1']!.evidencias).toBe(1);
  });
  it('un evento desconocido o roto no interrumpe la reproducción', () => {
    const raro = reproducir([...BITACORA.slice(0, 2), { ...ev('OTRO', {}), payload_canonico: 'no es json' }, ev('REGISTRO_EVIDENCIA', { codigo_iso: '9.9' })]);
    expect(raro).toHaveLength(5);
    expect(raro[4]!.estado).toBe('EN_EJECUCION');
  });
});

describe('fraseDe', () => {
  const s = reproducir(BITACORA);
  it('describe cada evento con sus datos', () => {
    expect(fraseDe(BITACORA[1]!, s[2]!, pct)).toBe('Se define el alcance: 2 controles');
    expect(fraseDe(BITACORA[2]!, s[3]!, pct)).toBe('Se evalúa el control 5.1: Implementado');
    expect(fraseDe(BITACORA[5]!, s[6]!, pct)).toBe('Hallazgo en el control 8.8, severidad alta');
    expect(fraseDe(BITACORA[6]!, s[7]!, pct)).toBe('Recomendación para el hallazgo del control 8.8');
    expect(fraseDe(BITACORA[8]!, s[9]!, pct)).toBe('Se cierra con un cumplimiento del 50 %');
  });
});
