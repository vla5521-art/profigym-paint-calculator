import { publicCalculation, assertCanonicalSummary } from '../calculations/service.js';
import { validateReport } from './schema.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function area(value) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 }).format(value); }

export function createJsonReport(record) {
  const calculation = publicCalculation(record);
  assertCanonicalSummary(calculation.featureSummary, calculation.featureRules.areaToleranceMm2);
  const report = {
    reportSchemaVersion: '1.0.0',
    applicationVersion: calculation.applicationVersion,
    algorithmVersion: calculation.algorithmVersion,
    calculationId: calculation.calculationId,
    sourceFile: { name: calculation.sourceFileName, sha256: calculation.sourceFileHash, sizeBytes: calculation.sourceFileSize },
    geometryFingerprint: record.payload.diagnostics.modelHash,
    createdAt: calculation.createdAt,
    updatedAt: calculation.updatedAt,
    units: record.payload.diagnostics.units,
    diagnostics: {
      counts: calculation.diagnostics.counts,
      validation: calculation.diagnostics.validation,
      performance: calculation.diagnostics.performance,
    },
    settings: { contactSettings: calculation.contactSettings, featureRules: calculation.featureRules },
    summary: calculation.featureSummary,
    contacts: calculation.contacts,
    features: calculation.features.filter((feature) => feature.featureType !== 'manual_feature'),
    manualExclusions: calculation.features.filter((feature) => feature.featureType === 'manual_feature'),
    reviewDecisions: calculation.features.filter((feature) => feature.manualDecision),
    warnings: calculation.warnings,
    paintIntegration: calculation.paintIntegration,
  };
  const validation = validateReport(report);
  if (!validation.valid) throw Object.assign(new Error('JSON-отчёт не соответствует схеме'), { code: 'REPORT_SCHEMA_INVALID', details: validation.errors });
  return report;
}

export function createHtmlReport(record, previewDataUrl = null) {
  const report = createJsonReport(record);
  const summary = report.summary;
  const rows = [
    ['Полная площадь', summary.totalAreaMm2, summary.totalArea?.cm2, summary.totalArea?.m2],
    ['Исключено по контактам', summary.confirmedContactExcludedAreaMm2, summary.confirmedContactExcludedArea?.cm2, summary.confirmedContactExcludedArea?.m2],
    ['Исключено по отверстиям', summary.confirmedHoleExcludedAreaMm2, summary.confirmedHoleExcludedArea?.cm2, summary.confirmedHoleExcludedArea?.m2],
    ['Исключено по полостям', summary.confirmedCavityExcludedAreaMm2, summary.confirmedCavityExcludedArea?.cm2, summary.confirmedCavityExcludedArea?.m2],
    ['Ручные исключения', summary.confirmedManualExcludedAreaMm2, summary.confirmedManualExcludedArea?.cm2, summary.confirmedManualExcludedArea?.m2],
    ['Перекрытие исключений', summary.overlapAreaMm2, summary.overlapArea?.cm2, summary.overlapArea?.m2],
    ['Окрашиваемая площадь', summary.paintableAreaMm2, summary.paintableArea?.cm2, summary.paintableArea?.m2],
  ].map(([label, mm2, cm2, m2]) => `<tr><th>${label}</th><td>${area(mm2)} мм²</td><td>${area(cm2)} см²</td><td>${area(m2)} м²</td></tr>`).join('');
  const featureRows = [...report.features, ...report.manualExclusions].map((feature) => `<tr><td>${escapeHtml(feature.featureType)}</td><td>${escapeHtml(feature.featureId)}</td><td>${escapeHtml(feature.status)}</td><td>${area(feature.excludedAreaMm2)} мм²</td></tr>`).join('') || '<tr><td colspan="4">Нет элементов</td></tr>';
  const contactRows = report.contacts.map((contact) => `<tr><td>${escapeHtml(contact.contactType)}</td><td>${escapeHtml(contact.contactId)}</td><td>${escapeHtml(contact.status)}</td><td>${area(contact.excludedPaintAreaMm2)} мм²</td></tr>`).join('') || '<tr><td colspan="4">Нет контактов</td></tr>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>CAD-отчёт ${escapeHtml(record.name)}</title><style>
    body{font:14px Arial,sans-serif;color:#17212c;max-width:1000px;margin:32px auto;padding:0 24px}h1{margin-bottom:4px}small{color:#586575}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #cfd6dc;padding:8px;text-align:left}thead th{background:#e9eef2}.summary th{width:38%}.formula{padding:12px;background:#eef6ff;border-left:4px solid #1976d2}@media print{body{margin:0;max-width:none}button{display:none}}</style></head><body>
    <button onclick="window.print()">Печать / сохранить PDF</button><h1>${escapeHtml(record.name)}</h1><small>Расчёт ${report.calculationId} · ${escapeHtml(report.sourceFile.name)} · ${escapeHtml(report.updatedAt)}</small>
    <p><strong>PROFiGYM ${report.applicationVersion}</strong> · алгоритм ${escapeHtml(report.algorithmVersion)} · SHA-256 ${report.sourceFile.sha256}</p>
    <div class="formula">Окрашиваемая площадь = Полная площадь − Уникальная подтверждённая площадь исключений</div>
    <table class="summary"><tbody>${rows}</tbody></table>
    <h2>Контакты</h2><table><thead><tr><th>Тип</th><th>ID</th><th>Статус</th><th>Площадь</th></tr></thead><tbody>${contactRows}</tbody></table>
    <h2>Технологические и ручные исключения</h2><table><thead><tr><th>Тип</th><th>ID</th><th>Статус</th><th>Площадь</th></tr></thead><tbody>${featureRows}</tbody></table>
    <h2>Настройки</h2><pre>${escapeHtml(JSON.stringify(report.settings, null, 2))}</pre>
    <h2>Предупреждения</h2><ul>${report.warnings.map((warning) => `<li>${escapeHtml(warning.code)}: ${escapeHtml(warning.message)}</li>`).join('') || '<li>Нет</li>'}</ul>
    ${previewDataUrl ? `<h2>Изображение модели</h2><img alt="Изометрический вид CAD-модели" src="${previewDataUrl}" style="display:block;max-width:100%;max-height:520px;margin:18px auto">` : '<p>Изображение модели: не приложено. Интерактивная 3D-модель доступна в сохранённом CAD-расчёте.</p>'}
  </body></html>`;
}

export const reportInternals = { escapeHtml };
