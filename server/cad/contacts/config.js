function finiteNumber(name, fallback, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

export function loadContactConfig(overrides = {}) {
  return Object.freeze({
    distanceToleranceMm: overrides.distanceToleranceMm
      ?? finiteNumber('CAD_CONTACT_DISTANCE_TOLERANCE_MM', 0.05, { min: 0, max: 10 }),
    angleToleranceDeg: overrides.angleToleranceDeg
      ?? finiteNumber('CAD_CONTACT_ANGLE_TOLERANCE_DEG', 1, { min: 0, max: 45 }),
    areaToleranceMm2: overrides.areaToleranceMm2
      ?? finiteNumber('CAD_CONTACT_AREA_TOLERANCE_MM2', 0.01, { min: 0, max: 100 }),
    reviewThreshold: overrides.reviewThreshold
      ?? finiteNumber('CAD_CONTACT_REVIEW_THRESHOLD', 0.9, { min: 0, max: 1 }),
  });
}

export const contactConfig = loadContactConfig();
