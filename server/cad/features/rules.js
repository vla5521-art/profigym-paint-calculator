const CONFIRMED = new Set(['confirmed', 'manually_confirmed']);

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function areaOf(faceIds, faceAreaById) {
  return uniqueSorted(faceIds).reduce((sum, id) => sum + (faceAreaById.get(id) ?? 0), 0);
}

function automaticDecision(feature, rules) {
  if (!rules.autoExcludeEnabled) {
    return { status: 'review_required', ruleId: 'FEATURE_AUTO_EXCLUDE_DISABLED', reason: 'Автоматическое исключение отключено для задания' };
  }
  if (feature.featureType === 'slot' || feature.featureType === 'ambiguous_feature') {
    return { status: 'review_required', ruleId: 'AMBIGUOUS_GEOMETRY_REVIEW', reason: 'Геометрия не подтверждает технологическое отверстие' };
  }
  if (feature.featureType === 'open_internal_cavity') {
    return {
      status: rules.openCavityReviewRequired ? 'review_required' : 'rejected',
      ruleId: 'OPEN_CAVITY_POLICY',
      reason: 'Полость имеет внешний проём и не является однозначно недоступной',
    };
  }
  if (feature.featureType === 'intersecting_holes') {
    return { status: 'review_required', ruleId: 'INTERSECTING_HOLES_REVIEW', reason: 'Пересекающиеся отверстия требуют проверки общей топологии' };
  }
  if (feature.featureType === 'closed_internal_cavity') {
    return rules.excludeClosedCavity
      ? { status: 'confirmed', ruleId: 'CLOSED_CAVITY_EXCLUDE', reason: 'Замкнутая внутренняя оболочка исключается правилом задания' }
      : { status: 'rejected', ruleId: 'CLOSED_CAVITY_KEEP', reason: 'Исключение закрытых полостей отключено правилом задания' };
  }
  if (feature.diameterMm < rules.holeMinDiameterMm || feature.diameterMm > rules.holeMaxDiameterMm) {
    return { status: 'rejected', ruleId: 'HOLE_DIAMETER_RANGE', reason: 'Диаметр находится вне настроенного диапазона исключения' };
  }
  if (feature.depthMm < rules.holeMinDepthMm || feature.depthMm > rules.holeMaxDepthMm) {
    return { status: 'rejected', ruleId: 'HOLE_DEPTH_RANGE', reason: 'Глубина находится вне настроенного диапазона исключения' };
  }
  if (feature.confidence < rules.confidenceThreshold) {
    return { status: 'review_required', ruleId: 'FEATURE_CONFIDENCE_THRESHOLD', reason: 'Уверенность распознавания ниже заданного порога' };
  }
  if (feature.featureType === 'countersunk_hole' && !rules.excludeCountersink) {
    return { status: 'rejected', ruleId: 'COUNTERSINK_KEEP', reason: 'Исключение зенковок отключено правилом задания' };
  }
  if (feature.featureType === 'counterbored_hole' && !rules.excludeCounterbore) {
    return { status: 'rejected', ruleId: 'COUNTERBORE_KEEP', reason: 'Исключение цековок отключено правилом задания' };
  }
  if (feature.through && !rules.excludeThrough) {
    return { status: 'rejected', ruleId: 'THROUGH_HOLE_KEEP', reason: 'Исключение сквозных отверстий отключено правилом задания' };
  }
  if (!feature.through && !rules.excludeBlind) {
    return { status: 'rejected', ruleId: 'BLIND_HOLE_KEEP', reason: 'Исключение глухих отверстий отключено правилом задания' };
  }
  return {
    status: 'confirmed',
    ruleId: feature.through ? 'THROUGH_HOLE_EXCLUDE' : 'BLIND_HOLE_EXCLUDE',
    reason: 'Геометрия и технологическое правило однозначно разрешают исключение',
  };
}

function ruleExcludedFaceIds(feature, rules) {
  if (feature.featureType === 'closed_internal_cavity' || feature.featureType === 'open_internal_cavity' || feature.featureType === 'manual_feature') {
    return uniqueSorted(feature.faceIds);
  }
  const sideFaces = feature.featureType === 'countersunk_hole' && !rules.excludeCountersink
    ? feature.sideFaceIds.filter((id) => !feature.transitionFaceIds.includes(id))
    : feature.sideFaceIds;
  return uniqueSorted([
    ...sideFaces,
    ...(rules.excludeBottomFace ? feature.bottomFaceIds : []),
    ...(rules.excludeBottomFace ? feature.transitionFaceIds.filter((id) => !sideFaces.includes(id)) : []),
  ]);
}

export function applyFeatureRules(features, rules, faceCatalog) {
  const faceAreaById = new Map(faceCatalog.map((face) => [face.id, face.areaMm2]));
  return features.map((feature) => {
    if (feature.featureType === 'manual_feature') {
      const excludedFaceIds = uniqueSorted(feature.faceIds);
      const area = areaOf(excludedFaceIds, faceAreaById);
      return {
        ...feature,
        excludedFaceIds,
        potentialAreaMm2: area,
        excludedAreaMm2: area,
        confidence: 1,
        status: 'manually_confirmed',
        initialStatus: 'manually_confirmed',
        manualDecision: 'manually_confirmed',
        ruleId: 'MANUAL_FACE_SELECTION',
        reason: 'Исключение создано пользователем по выбранным граням',
      };
    }
    const decision = automaticDecision(feature, rules);
    const excludedFaceIds = ruleExcludedFaceIds(feature, rules);
    const potentialAreaMm2 = areaOf(excludedFaceIds, faceAreaById);
    const status = feature.manualDecision ?? decision.status;
    const confirmed = CONFIRMED.has(status);
    return {
      ...feature,
      excludedFaceIds,
      potentialAreaMm2,
      excludedAreaMm2: confirmed ? potentialAreaMm2 : 0,
      initialStatus: decision.status,
      status,
      ruleId: feature.manualDecision ? 'MANUAL_FEATURE_DECISION' : decision.ruleId,
      reason: feature.manualDecision
        ? `Ручное решение пользователя: ${feature.manualDecision}`
        : decision.reason,
    };
  });
}

export function publicRuleConfig(rules) {
  return { ...rules };
}

export const ruleInternals = { automaticDecision, ruleExcludedFaceIds, areaOf };
