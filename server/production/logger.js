const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const BASE_REDACTIONS = new Set(['authorization', 'cookie', 'token', 'password', 'secret']);

function redact(value, fields, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, fields, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = fields.has(key.toLowerCase()) ? '[REDACTED]' : redact(item, fields, seen);
  }
  return output;
}

export function createLogger({ service, environment = 'development', applicationVersion = '2.0.3', level = 'info', format = 'json', redactFields = [] }) {
  const minimum = LEVELS[level] ?? LEVELS.info;
  const fields = new Set([...BASE_REDACTIONS, ...redactFields.map((item) => item.toLowerCase())]);
  const write = (logLevel, event, details = {}) => {
    if ((LEVELS[logLevel] ?? 100) < minimum) return;
    const entry = redact({ timestamp: new Date().toISOString(), level: logLevel, service, environment, applicationVersion, event, ...details }, fields);
    const line = format === 'json' ? JSON.stringify(entry) : `${entry.timestamp} ${logLevel.toUpperCase()} ${service} ${event} ${JSON.stringify(details)}`;
    (logLevel === 'error' ? console.error : logLevel === 'warn' ? console.warn : console.info)(line);
  };
  return {
    debug: (event, details) => write('debug', event, details),
    info: (event, details) => write('info', event, details),
    warn: (event, details) => write('warn', event, details),
    error: (event, details) => write('error', event, details),
  };
}
