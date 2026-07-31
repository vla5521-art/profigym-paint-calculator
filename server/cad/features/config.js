function finiteNumber(name, fallback, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function booleanValue(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  throw new Error(`${name} must be a boolean`);
}

export const FEATURE_RULE_FIELDS = Object.freeze([
  'autoExcludeEnabled',
  'holeMinDiameterMm',
  'holeMaxDiameterMm',
  'holeMinDepthMm',
  'holeMaxDepthMm',
  'excludeThrough',
  'excludeBlind',
  'excludeBottomFace',
  'excludeCountersink',
  'excludeCounterbore',
  'excludeClosedCavity',
  'openCavityReviewRequired',
  'confidenceThreshold',
  'areaToleranceMm2',
  'axisToleranceMm',
  'angleToleranceDeg',
]);

export function loadFeatureConfig(overrides = {}) {
  const config = {
    autoExcludeEnabled: overrides.autoExcludeEnabled
      ?? booleanValue('CAD_FEATURE_AUTO_EXCLUDE_ENABLED', true),
    holeMinDiameterMm: overrides.holeMinDiameterMm
      ?? finiteNumber('CAD_HOLE_MIN_DIAMETER_MM', 0.5, { max: 100000 }),
    holeMaxDiameterMm: overrides.holeMaxDiameterMm
      ?? finiteNumber('CAD_HOLE_MAX_DIAMETER_MM', 1000, { max: 100000 }),
    holeMinDepthMm: overrides.holeMinDepthMm
      ?? finiteNumber('CAD_HOLE_MIN_DEPTH_MM', 0.5, { max: 100000 }),
    holeMaxDepthMm: overrides.holeMaxDepthMm
      ?? finiteNumber('CAD_HOLE_MAX_DEPTH_MM', 1000, { max: 100000 }),
    excludeThrough: overrides.excludeThrough
      ?? booleanValue('CAD_HOLE_EXCLUDE_THROUGH', true),
    excludeBlind: overrides.excludeBlind
      ?? booleanValue('CAD_HOLE_EXCLUDE_BLIND', true),
    excludeBottomFace: overrides.excludeBottomFace
      ?? booleanValue('CAD_HOLE_EXCLUDE_BOTTOM_FACE', false),
    excludeCountersink: overrides.excludeCountersink
      ?? booleanValue('CAD_COUNTERSINK_EXCLUDE', true),
    excludeCounterbore: overrides.excludeCounterbore
      ?? booleanValue('CAD_COUNTERBORE_EXCLUDE', true),
    excludeClosedCavity: overrides.excludeClosedCavity
      ?? booleanValue('CAD_CLOSED_CAVITY_EXCLUDE', true),
    openCavityReviewRequired: overrides.openCavityReviewRequired
      ?? booleanValue('CAD_OPEN_CAVITY_REVIEW_REQUIRED', true),
    confidenceThreshold: overrides.confidenceThreshold
      ?? finiteNumber('CAD_FEATURE_CONFIDENCE_THRESHOLD', 0.9, { max: 1 }),
    areaToleranceMm2: overrides.areaToleranceMm2
      ?? finiteNumber('CAD_FEATURE_AREA_TOLERANCE_MM2', 0.01, { max: 10000 }),
    axisToleranceMm: overrides.axisToleranceMm
      ?? finiteNumber('CAD_FEATURE_AXIS_TOLERANCE_MM', 0.05, { max: 100 }),
    angleToleranceDeg: overrides.angleToleranceDeg
      ?? finiteNumber('CAD_FEATURE_ANGLE_TOLERANCE_DEG', 1, { max: 45 }),
  };
  validateFeatureRules(config);
  return Object.freeze(config);
}

export function validateFeatureRules(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('Правила должны быть объектом');
  }
  for (const key of Object.keys(candidate)) {
    if (!FEATURE_RULE_FIELDS.includes(key)) throw new TypeError(`Неизвестное правило: ${key}`);
  }
  const booleans = [
    'autoExcludeEnabled',
    'excludeThrough',
    'excludeBlind',
    'excludeBottomFace',
    'excludeCountersink',
    'excludeCounterbore',
    'excludeClosedCavity',
    'openCavityReviewRequired',
  ];
  for (const key of booleans) {
    if (typeof candidate[key] !== 'boolean') throw new TypeError(`${key} must be a boolean`);
  }
  const numbers = FEATURE_RULE_FIELDS.filter((key) => !booleans.includes(key));
  for (const key of numbers) {
    if (!Number.isFinite(candidate[key]) || candidate[key] < 0) {
      throw new TypeError(`${key} must be a non-negative finite number`);
    }
  }
  if (candidate.holeMinDiameterMm > candidate.holeMaxDiameterMm) {
    throw new TypeError('Минимальный диаметр не может превышать максимальный');
  }
  if (candidate.holeMinDepthMm > candidate.holeMaxDepthMm) {
    throw new TypeError('Минимальная глубина не может превышать максимальную');
  }
  if (candidate.confidenceThreshold > 1) throw new TypeError('Порог уверенности должен быть от 0 до 1');
  if (candidate.angleToleranceDeg > 45) throw new TypeError('Угловой допуск не может превышать 45°');
  return candidate;
}

export function mergeFeatureRules(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new TypeError('Изменения правил должны быть объектом');
  }
  for (const key of Object.keys(patch)) {
    if (!FEATURE_RULE_FIELDS.includes(key)) throw new TypeError(`Неизвестное правило: ${key}`);
  }
  return loadFeatureConfig({ ...current, ...patch });
}

export const featureConfig = loadFeatureConfig();
