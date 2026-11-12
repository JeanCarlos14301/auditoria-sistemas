/**
 * Error de aplicación con estado HTTP.
 * Formato de respuesta (ver errorHandler):
 *   { "error": "<mensaje>", "code": "<CODIGO>", "details"?: ..., ...extra }
 * `extra` se fusiona en la raíz del cuerpo (p. ej. `anomalias` en el bloqueo de cierre).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message = 'Solicitud inválida', details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'No autenticado') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Acceso denegado') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Recurso no encontrado') {
    return new AppError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError(409, 'CONFLICT', message, details);
  }
  static unprocessable(message: string, details?: unknown, extra?: Record<string, unknown>) {
    return new AppError(422, 'UNPROCESSABLE_ENTITY', message, details, extra);
  }
  static tooManyRequests(message = 'Demasiadas solicitudes, intente más tarde') {
    return new AppError(429, 'TOO_MANY_REQUESTS', message);
  }
}
