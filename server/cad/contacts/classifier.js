function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalized(vector) {
  const length = vectorLength(vector);
  if (length === 0) return null;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

export function normalAlignmentDifferenceDeg(left, right) {
  const a = normalized(left);
  const b = normalized(right);
  if (!a || !b) return null;
  const angle = Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1)) * 180 / Math.PI;
  return Math.min(angle, 180 - angle);
}

export function classifyExactContact({
  faceA,
  faceB,
  contactAreaMm2,
  angleDifferenceDeg,
  config,
}) {
  const aligned = angleDifferenceDeg === null || angleDifferenceDeg <= config.angleToleranceDeg;
  const surfaces = [faceA.surfaceType, faceB.surfaceType];
  let contactType = 'ambiguous_contact';
  let confidence = 0.55;
  let reason = 'Совпадающая область найдена, но тип поверхностей требует проверки';

  if (surfaces.every((type) => type === 'plane')) {
    const fullA = Math.abs(faceA.areaMm2 - contactAreaMm2) <= config.areaToleranceMm2;
    const fullB = Math.abs(faceB.areaMm2 - contactAreaMm2) <= config.areaToleranceMm2;
    contactType = fullA && fullB ? 'full_planar_contact' : 'partial_planar_contact';
    confidence = aligned ? 0.99 : 0.7;
    reason = fullA && fullB
      ? 'Точная B-Rep операция подтвердила совпадение обеих плоских граней'
      : 'Точная B-Rep операция вычислила частичное перекрытие плоских граней';
  } else if (surfaces.every((type) => type === 'cylinder')) {
    contactType = 'cylindrical_contact';
    confidence = aligned ? 0.97 : 0.68;
    reason = 'Точная B-Rep операция подтвердила совпадающий участок цилиндрических граней';
  }

  if (!aligned) {
    contactType = 'ambiguous_contact';
    reason = `Угловое расхождение ${angleDifferenceDeg.toFixed(6)}° превышает допуск ${config.angleToleranceDeg}°`;
  }

  return {
    contactType,
    confidence,
    status: aligned && confidence >= config.reviewThreshold ? 'confirmed' : 'review_required',
    reason,
  };
}

export function classifyZeroAreaContact({ distanceMm, hasPotentialArea, config }) {
  if (distanceMm > 1e-7 && distanceMm <= config.distanceToleranceMm && hasPotentialArea) {
    return {
      contactType: 'near_gap',
      confidence: 0.5,
      status: 'review_required',
      reason: 'Плоские грани имеют малый положительный зазор; автоматическое исключение запрещено',
    };
  }
  if (distanceMm <= 1e-7) {
    return {
      contactType: 'tangent_contact',
      confidence: 0.99,
      status: 'rejected',
      reason: 'Обнаружено касание по линии или точке без исключаемой площади',
    };
  }
  return {
    contactType: 'near_gap',
    confidence: 0.99,
    status: 'rejected',
    reason: 'Положительный зазор не является фактическим контактом',
  };
}
