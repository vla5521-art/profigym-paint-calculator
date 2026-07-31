import { OcctKernel } from 'occt-wasm';
import { areaUnits } from '../units.js';
import { findBodyCandidates, findFaceCandidates } from './broad-phase.js';
import { deduplicateNarrowResults, exactCheck } from './narrow-phase.js';

const HASH_UPPER_BOUND = 2_147_483_647;

function apiNumber(value) {
  return Number(value.toFixed(9));
}

function releaseMany(kernel, shapes) {
  for (const shape of shapes) kernel.release(shape);
}

function uniqueByHash(kernel, shapes) {
  const seen = new Set();
  return shapes.filter((shape) => {
    const hash = kernel.hashCode(shape, HASH_UPPER_BOUND);
    if (seen.has(hash)) {
      kernel.release(shape);
      return false;
    }
    seen.add(hash);
    return true;
  });
}

function buildEntities(kernel, shape, topology) {
  const solids = uniqueByHash(kernel, kernel.getSubShapes(shape, 'solid'));
  const allFaces = uniqueByHash(kernel, kernel.getSubShapes(shape, 'face'));
  const faceByHash = new Map();
  allFaces.forEach((face, index) => {
    const report = topology.faces[index];
    faceByHash.set(kernel.hashCode(face, HASH_UPPER_BOUND), {
      handle: face,
      id: report.id,
      bodyId: report.bodyId,
      surfaceType: report.surfaceType,
      areaMm2: report.area.mm2,
      center: { x: report.centerMm[0], y: report.centerMm[1], z: report.centerMm[2] },
      bounds: kernel.getBoundingBox(face),
    });
  });

  const bodies = solids.map((solid, index) => {
    const report = topology.bodies[index];
    const bodyFaceHandles = uniqueByHash(kernel, kernel.getSubShapes(solid, 'face'));
    const faces = bodyFaceHandles
      .map((face) => faceByHash.get(kernel.hashCode(face, HASH_UPPER_BOUND)))
      .filter(Boolean);
    releaseMany(kernel, bodyFaceHandles);
    return {
      handle: solid,
      id: report.id,
      bounds: kernel.getBoundingBox(solid),
      faces,
    };
  });

  return {
    bodies,
    release() {
      releaseMany(kernel, solids);
      releaseMany(kernel, allFaces);
    },
  };
}

function publicContact(contact) {
  const { patchBrep: _patchBrep, patchKey: _patchKey, initialStatus: _initialStatus, ...safe } = contact;
  return {
    ...safe,
    contactAreaMm2: apiNumber(contact.contactAreaMm2),
    physicalContactAreaMm2: apiNumber(contact.physicalContactAreaMm2),
    potentialContactAreaMm2: apiNumber(contact.potentialContactAreaMm2),
    distanceMm: apiNumber(contact.distanceMm),
    angleDifferenceDeg: contact.angleDifferenceDeg === null ? null : apiNumber(contact.angleDifferenceDeg),
    excludedPaintAreaMm2: contact.status === 'confirmed' ? apiNumber(contact.contactAreaMm2 * 2) : 0,
  };
}

function groupPatchBreps(contacts, keyFactory) {
  const groups = new Map();
  for (const contact of contacts) {
    if (!contact.patchBrep || contact.contactAreaMm2 <= 0) continue;
    for (const key of keyFactory(contact)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(contact.patchBrep);
    }
  }
  return groups;
}

function unionGroupArea(kernel, breps) {
  const handles = breps.map((brep) => kernel.fromBREP(brep));
  try {
    if (handles.length === 1) return kernel.getSurfaceArea(handles[0]);
    const fused = kernel.fuseAll(handles);
    try {
      return kernel.getSurfaceArea(fused);
    } finally {
      kernel.release(fused);
    }
  } finally {
    releaseMany(kernel, handles);
  }
}

function summedUnionArea(kernel, groups) {
  let total = 0;
  for (const breps of groups.values()) total += unionGroupArea(kernel, [...new Set(breps)]);
  return total;
}

export function calculateContactSummaryWithKernel(kernel, contacts, totalAreaMm2, areaToleranceMm2) {
  const confirmed = contacts.filter((contact) => contact.status === 'confirmed');
  const reviewRequired = contacts.filter((contact) => contact.status === 'review_required');
  const physicalGroups = groupPatchBreps(confirmed, (contact) => [[contact.bodyAId, contact.bodyBId].sort().join('|')]);
  const excludedGroups = groupPatchBreps(confirmed, (contact) => [contact.faceAId, contact.faceBId]);
  const reviewGroups = groupPatchBreps(reviewRequired, (contact) => [[contact.bodyAId, contact.bodyBId].sort().join('|')]);
  const confirmedPhysicalContactAreaMm2 = summedUnionArea(kernel, physicalGroups);
  const confirmedExcludedPaintAreaMm2 = summedUnionArea(kernel, excludedGroups);
  const reviewRequiredPhysicalAreaMm2 = summedUnionArea(kernel, reviewGroups);

  if (confirmedExcludedPaintAreaMm2 > totalAreaMm2 + areaToleranceMm2) {
    const error = new Error('Сумма исключений превышает полную площадь модели');
    error.code = 'CONTACT_AREA_OVERFLOW';
    error.details = { totalAreaMm2, confirmedExcludedPaintAreaMm2, areaToleranceMm2 };
    throw error;
  }

  const paintableAreaMm2 = Math.max(0, totalAreaMm2 - confirmedExcludedPaintAreaMm2);
  return {
    totalAreaMm2,
    confirmedPhysicalContactAreaMm2,
    confirmedExcludedPaintAreaMm2,
    reviewRequiredPhysicalAreaMm2,
    paintableAreaMm2,
    totalArea: areaUnits(totalAreaMm2),
    confirmedPhysicalContactArea: areaUnits(confirmedPhysicalContactAreaMm2),
    confirmedExcludedPaintArea: areaUnits(confirmedExcludedPaintAreaMm2),
    reviewRequiredPhysicalArea: areaUnits(reviewRequiredPhysicalAreaMm2),
    paintableArea: areaUnits(paintableAreaMm2),
  };
}

export async function recalculateContactSummary(contacts, totalAreaMm2, areaToleranceMm2) {
  const kernel = await OcctKernel.init();
  try {
    return calculateContactSummaryWithKernel(kernel, contacts, totalAreaMm2, areaToleranceMm2);
  } finally {
    kernel.releaseAll();
    kernel[Symbol.dispose]();
  }
}

export function detectContacts(kernel, shape, topology, config) {
  const totalStarted = performance.now();
  const createdAt = new Date().toISOString();
  const entities = buildEntities(kernel, shape, topology);
  try {
    const broad = findBodyCandidates(entities.bodies, config.distanceToleranceMm);
    const faceCandidates = findFaceCandidates(broad.pairs, config.distanceToleranceMm);
    const narrowStarted = performance.now();
    const exactResults = faceCandidates.map((candidate) => exactCheck(kernel, candidate, config, createdAt));
    const narrowMs = performance.now() - narrowStarted;
    const classificationStarted = performance.now();
    const contacts = deduplicateNarrowResults(exactResults);
    const classificationMs = performance.now() - classificationStarted;
    const summary = calculateContactSummaryWithKernel(kernel, contacts, topology.totalArea.mm2, config.areaToleranceMm2);
    return {
      contacts,
      summary,
      statistics: {
        ...broad.statistics,
        narrowPhaseCandidateCount: faceCandidates.length,
        exactCheckCount: faceCandidates.length,
        narrowPhaseMs: apiNumber(narrowMs),
        classificationMs: apiNumber(classificationMs),
        totalContactProcessingMs: apiNumber(performance.now() - totalStarted),
      },
    };
  } catch (error) {
    if (!error.code) error.code = 'CONTACT_GEOMETRY_FAILED';
    throw error;
  } finally {
    entities.release();
  }
}

export function publicContactsResult(contactResult) {
  const summary = Object.fromEntries(
    Object.entries(contactResult.summary).map(([key, value]) => {
      if (typeof value === 'number') return [key, apiNumber(value)];
      if (value && typeof value === 'object' && 'mm2' in value) {
        return [key, {
          mm2: apiNumber(value.mm2),
          cm2: apiNumber(value.cm2),
          m2: apiNumber(value.m2),
        }];
      }
      return [key, value];
    }),
  );
  return {
    contacts: contactResult.contacts.map(publicContact),
    summary,
    statistics: contactResult.statistics,
  };
}

export const contactServiceInternals = {
  buildEntities,
  publicContact,
  groupPatchBreps,
  unionGroupArea,
};
