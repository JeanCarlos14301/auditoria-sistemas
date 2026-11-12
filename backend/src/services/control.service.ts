import { pool } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import type { CrearControlInput } from '../schemas/control.schemas.js';
import type { ControlISO } from '../types/domain.js';

export async function listarControles(): Promise<ControlISO[]> {
  const { rows } = await pool.query<ControlISO>(
    `SELECT * FROM control ORDER BY clausula, split_part(codigo_iso, '.', 2)::int`,
  );
  return rows;
}

export async function obtenerControl(id: number): Promise<ControlISO> {
  const { rows } = await pool.query<ControlISO>('SELECT * FROM control WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Control no encontrado');
  return rows[0];
}

export async function crearControl(input: CrearControlInput): Promise<ControlISO> {
  try {
    const { rows } = await pool.query<ControlISO>(
      `INSERT INTO control (codigo_iso, clausula, categoria_tema, nombre, criterio_evaluacion, ejemplo_evidencia,
                            attr_tipo_control, attr_propiedades_cia, attr_concepto_nist,
                            attr_capacidad_operativa, attr_dominio_seguridad)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        input.codigo_iso,
        input.clausula,
        input.categoria_tema,
        input.nombre,
        input.criterio_evaluacion,
        input.ejemplo_evidencia,
        input.attr_tipo_control,
        input.attr_propiedades_cia,
        input.attr_concepto_nist,
        input.attr_capacidad_operativa,
        input.attr_dominio_seguridad,
      ],
    );
    return rows[0]!;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw AppError.conflict(`Ya existe un control con código ${input.codigo_iso}`);
    }
    throw err;
  }
}
