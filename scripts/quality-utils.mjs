import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const root = path.resolve(new URL('..', import.meta.url).pathname);
export const reportsDir = path.join(root, 'diagnostic-reports');

export async function sha256File(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function stableResult(result) {
  const diagnostics = result.diagnostics;
  const contacts = diagnostics.contacts?.contacts ?? [];
  const features = diagnostics.features?.features ?? [];
  return {
    algorithmVersions: {
      geometry: '2.0.0', contact: '3.0.0', feature: '4.0.0', viewerMesh: result.viewerMesh?.meshVersion ?? '1.0.0', reportSchema: '1.0.0',
    },
    geometryFingerprint: diagnostics.modelHash,
    geometryStatus: result.ok ? 'valid' : 'invalid',
    counts: diagnostics.counts,
    units: diagnostics.units,
    totalAreaMm2: diagnostics.totalArea.mm2,
    areas: {
      contactPhysicalMm2: diagnostics.contacts?.summary?.confirmedPhysicalContactAreaMm2 ?? 0,
      contactExcludedMm2: diagnostics.features?.summary?.confirmedContactExcludedAreaMm2 ?? 0,
      holeExcludedMm2: diagnostics.features?.summary?.confirmedHoleExcludedAreaMm2 ?? 0,
      cavityExcludedMm2: diagnostics.features?.summary?.confirmedCavityExcludedAreaMm2 ?? 0,
      manualExcludedMm2: diagnostics.features?.summary?.confirmedManualExcludedAreaMm2 ?? 0,
      rawExcludedMm2: diagnostics.features?.summary?.rawExcludedAreaMm2 ?? 0,
      overlapMm2: diagnostics.features?.summary?.overlapAreaMm2 ?? 0,
      uniqueExcludedMm2: diagnostics.features?.summary?.uniqueConfirmedExcludedAreaMm2 ?? 0,
      paintableMm2: diagnostics.features?.summary?.paintableAreaMm2 ?? diagnostics.totalArea.mm2,
    },
    contacts: contacts.map((item) => ({ type: item.classification, status: item.status, areaMm2: item.physicalAreaMm2, faceIds: [item.faceAId, item.faceBId].sort(), contactId: item.contactId })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    features: features.map((item) => ({ type: item.featureType, status: item.status, areaMm2: item.excludedAreaMm2, faceIds: [...item.faceIds].sort(), featureId: item.featureId })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    warnings: (diagnostics.warnings ?? []).map((item) => item.code).sort(),
    errors: (diagnostics.errors ?? []).map((item) => item.code).sort(),
    mesh: { faceCount: result.viewerMesh?.faces?.length ?? 0, triangleCount: result.viewerMesh?.statistics?.triangleCount ?? 0 },
  };
}

export function withoutEntityIds(value) {
  const copy = structuredClone(value);
  for (const item of [...(copy.contacts ?? []), ...(copy.features ?? [])]) {
    delete item.contactId;
    delete item.featureId;
  }
  return copy;
}

export function deviation(expected, actual, absoluteTolerance = 0.05, relativeTolerance = 1e-6) {
  const absolute = Math.abs(actual - expected);
  const relative = expected === 0 ? (absolute === 0 ? 0 : Infinity) : absolute / Math.abs(expected);
  return { expected, actual, absoluteDeviation: absolute, relativeDeviation: relative, absoluteTolerance, relativeTolerance, pass: absolute <= absoluteTolerance || relative <= relativeTolerance };
}
