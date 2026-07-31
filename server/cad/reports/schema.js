export const reportSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://profigym.local/schemas/cad-report-1.0.0.json',
  title: 'PROFiGYM CAD calculation report',
  type: 'object',
  required: ['reportSchemaVersion', 'applicationVersion', 'algorithmVersion', 'calculationId', 'sourceFile', 'createdAt', 'updatedAt', 'units', 'diagnostics', 'settings', 'summary', 'contacts', 'features', 'manualExclusions', 'reviewDecisions', 'warnings', 'paintIntegration'],
  properties: {
    reportSchemaVersion: { const: '1.0.0' },
    applicationVersion: { type: 'string' },
    algorithmVersion: { type: 'string' },
    calculationId: { type: 'string', format: 'uuid' },
    sourceFile: { type: 'object', required: ['name', 'sha256', 'sizeBytes'], properties: { name: { type: 'string' }, sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, sizeBytes: { type: 'integer', minimum: 1 } } },
    summary: { type: 'object', required: ['totalAreaMm2', 'uniqueConfirmedExcludedAreaMm2', 'paintableAreaMm2'] },
    contacts: { type: 'array' },
    features: { type: 'array' },
    warnings: { type: 'array' },
  },
};

export function validateReport(report) {
  const missing = reportSchema.required.filter((key) => !(key in report));
  const valid = missing.length === 0
    && report.reportSchemaVersion === '1.0.0'
    && /^[0-9a-f-]{36}$/i.test(report.calculationId)
    && /^[0-9a-f]{64}$/i.test(report.sourceFile?.sha256 ?? '')
    && Number.isFinite(report.summary?.paintableAreaMm2);
  return { valid, errors: missing.map((key) => ({ path: key, message: 'required' })) };
}

