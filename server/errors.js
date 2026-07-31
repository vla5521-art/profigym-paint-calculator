export class ApiError extends Error {
  constructor(status, code, message, details = null) { super(message); this.status = status; this.code = code; this.details = details; }
}

export function diagnosticIssue(code, message, details = null) {
  return { code, message, details };
}

export function errorPayload(error, requestId) {
  return { error: { code: error.code || 'INTERNAL_ERROR', message: error.message || 'Внутренняя ошибка сервера', details: error.details ?? null, requestId } };
}
