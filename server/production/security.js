import crypto from 'node:crypto';
import net from 'node:net';
import { ApiError } from '../errors.js';
import { increment } from './metrics.js';

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  const length = Math.max(a.length, b.length, 1);
  const paddedA = Buffer.alloc(length); const paddedB = Buffer.alloc(length);
  a.copy(paddedA); b.copy(paddedB);
  return crypto.timingSafeEqual(paddedA, paddedB) && a.length === b.length;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((item) => item.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

function signSession(token, expiresAt) {
  const payload = String(expiresAt);
  const signature = crypto.createHmac('sha256', token).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function validSession(cookie, token) {
  const [expiresAt, signature, ...extra] = String(cookie ?? '').split('.');
  if (extra.length || !expiresAt || !signature || Number(expiresAt) <= Date.now()) return false;
  return timingSafeEqualText(signature, crypto.createHmac('sha256', token).update(expiresAt).digest('base64url'));
}

export function requestContext(_config) {
  return (req, res, next) => {
    const supplied = req.get('x-request-id');
    req.requestId = supplied && REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
    req.correlationId = req.requestId;
    res.setHeader('x-request-id', req.requestId);
    res.setHeader('x-correlation-id', req.correlationId);
    next();
  };
}

export function securityHeaders(config) {
  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (config.publicUrl.startsWith('https://')) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

export function cors(config) {
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    } else if (origin && req.method === 'OPTIONS') {
      return next(new ApiError(403, 'CORS_ORIGIN_DENIED', 'Источник запроса не разрешён'));
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}

export function createAuth(config) {
  const enabled = Boolean(config.accessToken);
  const authenticated = (req, metrics = false) => {
    if (!enabled) return true;
    const expected = metrics ? config.metricsToken : config.accessToken;
    const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer && timingSafeEqualText(bearer, expected)) return true;
    return !metrics && validSession(parseCookies(req.get('cookie')).profigym_session, config.accessToken);
  };
  const requireAuth = (req, _res, next) => authenticated(req) ? next() : next(new ApiError(401, 'AUTH_REQUIRED', 'Требуется авторизация'));
  const requireMetricsAuth = (req, _res, next) => authenticated(req, true) ? next() : next(new ApiError(401, 'AUTH_REQUIRED', 'Требуется авторизация'));
  const login = (req, res, next) => {
    if (!enabled || timingSafeEqualText(req.body?.token, config.accessToken)) {
      const expiresAt = Date.now() + config.sessionTtlSeconds * 1000;
      if (enabled) res.setHeader('Set-Cookie', `profigym_session=${encodeURIComponent(signSession(config.accessToken, expiresAt))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${config.sessionTtlSeconds}${config.publicUrl.startsWith('https://') ? '; Secure' : ''}`);
      return res.json({ authenticated: true, expiresAt: enabled ? new Date(expiresAt).toISOString() : null });
    }
    increment('profigym_auth_rejected_total');
    next(new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный токен доступа'));
  };
  return { enabled, authenticated, requireAuth, requireMetricsAuth, login };
}

export function createRateLimiter(config) {
  const buckets = new Map();
  return (category) => (req, res, next) => {
    const policy = config.rateLimits[category] ?? config.rateLimits.read;
    const forwarded = config.trustProxy ? req.ip : req.socket.remoteAddress;
    const identity = net.isIP(forwarded ?? '') ? forwarded : 'unknown';
    const key = `${category}:${identity}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + policy.windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader('RateLimit-Limit', policy.limit);
    res.setHeader('RateLimit-Remaining', Math.max(0, policy.limit - bucket.count));
    if (bucket.count > policy.limit) {
      const retry = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', retry);
      increment('http_rate_limit_rejections_total', { category });
      return next(new ApiError(429, 'RATE_LIMITED', 'Слишком много запросов; повторите позже', { retryAfterSeconds: retry }));
    }
    next();
  };
}
