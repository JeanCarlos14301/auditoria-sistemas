/**
 * Verificación forense de la Hash Chain de una auditoría desde la línea de comandos.
 *   npm run chain:verify -- 1
 * Código de salida 0 = cadena íntegra, 2 = ruptura detectada.
 */
import { verificarCadena } from '../crypto/hashChain.js';
import { closePool } from '../db/pool.js';

const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
  console.error('Uso: npm run chain:verify -- <id_auditoria>');
  process.exit(1);
}

try {
  const resultado = await verificarCadena(id);
  console.log(JSON.stringify(resultado, null, 2));
  process.exitCode = resultado.valida ? 0 : 2;
} finally {
  await closePool();
}
