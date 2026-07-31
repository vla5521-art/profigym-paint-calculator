import { assertCanonicalSummary } from '../calculations/service.js';

export function createPaintIntegration(record, confirmed) {
  if (confirmed !== true) throw Object.assign(new Error('Передача площади требует явного подтверждения'), { code: 'PAINT_INTEGRATION_CONFIRMATION_REQUIRED' });
  const summary = assertCanonicalSummary(record.payload.featureSummary, record.payload.featureRules.areaToleranceMm2);
  if (record.status !== 'completed') throw Object.assign(new Error('Расчёт не завершён'), { code: 'CALCULATION_NOT_READY' });
  if (!(summary.paintableAreaMm2 > 0)) throw Object.assign(new Error('Нулевая площадь не может быть передана'), { code: 'PAINTABLE_AREA_INVALID' });
  return {
    paintableAreaMm2: summary.paintableAreaMm2,
    paintableAreaM2: summary.paintableAreaMm2 / 1_000_000,
    calculationId: record.id,
    sourceFileName: record.sourceFileName,
    calculatedAt: record.updatedAt,
    algorithmVersion: record.algorithmVersion,
    source: 'cad_calculation',
    warning: record.payload.features.some((feature) => feature.status === 'review_required')
      ? 'В расчёте остались неподтверждённые области. Они не исключены из окрашиваемой площади.'
      : null,
  };
}

