import { createHash } from 'node:crypto';
import { OcctKernel } from 'occt-wasm';
import { areaUnits, detectStepUnits } from './units.js';
import { diagnosticIssue } from '../errors.js';
import { loadContactConfig } from './contacts/config.js';
import { detectContacts, publicContactsResult } from './contacts/service.js';
import { loadFeatureConfig } from './features/config.js';
import {
  detectFeatures,
  emptyFeatureResult,
  publicFeaturesResult,
} from './features/service.js';
import { buildViewerMesh } from './viewer/service.js';
import { viewerConfig } from './viewer/config.js';

const HASH_UPPER_BOUND = 2_147_483_647;
let kernelPromise;
let queue = Promise.resolve();

async function getKernel() {
  kernelPromise ??= OcctKernel.init();
  return kernelPromise;
}

function serialize(task) {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

function rounded(value) {
  return Number(value.toFixed(9));
}

function validateStepEnvelope(content) {
  const upper = content.toUpperCase();
  if (!upper.includes('ISO-10303-21') || !upper.includes('HEADER;') || !upper.includes('DATA;') || !upper.includes('END-ISO-10303-21')) {
    return diagnosticIssue('INVALID_STEP_FILE', 'Файл не содержит обязательную структуру STEP ISO 10303-21');
  }
  const dataSection = upper.match(/DATA\s*;([\s\S]*?)ENDSEC\s*;/);
  if (!dataSection || !/#\d+\s*=/.test(dataSection[1])) {
    return diagnosticIssue('EMPTY_MODEL', 'STEP-файл не содержит геометрических сущностей');
  }
  return null;
}

function stableEntityId(kind, modelHash, index, fingerprint) {
  return `${kind}_${createHash('sha256').update(`${modelHash}:${kind}:${index}:${fingerprint}`).digest('hex').slice(0, 24)}`;
}

function entityHash(kernel, shape) {
  return kernel.hashCode(shape, HASH_UPPER_BOUND);
}

function uniqueByHash(kernel, shapes) {
  const seen = new Set();
  return shapes.filter((shape) => {
    const hash = entityHash(kernel, shape);
    if (seen.has(hash)) {
      kernel.release(shape);
      return false;
    }
    seen.add(hash);
    return true;
  });
}

function releaseMany(kernel, shapes) {
  for (const shape of shapes) kernel.release(shape);
}

function emptyContactResult(totalAreaMm2 = 0, bodyCount = 0) {
  const totalArea = areaUnits(totalAreaMm2);
  return {
    contacts: [],
    summary: {
      totalAreaMm2,
      confirmedPhysicalContactAreaMm2: 0,
      confirmedExcludedPaintAreaMm2: 0,
      reviewRequiredPhysicalAreaMm2: 0,
      paintableAreaMm2: totalAreaMm2,
      totalArea,
      confirmedPhysicalContactArea: areaUnits(0),
      confirmedExcludedPaintArea: areaUnits(0),
      reviewRequiredPhysicalArea: areaUnits(0),
      paintableArea: totalArea,
    },
    statistics: {
      bodyCount,
      potentialBodyPairCount: bodyCount * (bodyCount - 1) / 2,
      broadPhaseBodyPairCount: 0,
      narrowPhaseCandidateCount: 0,
      exactCheckCount: 0,
      broadPhaseMs: 0,
      narrowPhaseMs: 0,
      classificationMs: 0,
      totalContactProcessingMs: 0,
    },
  };
}

function failedAnalysis(sourceName, modelHash, units, warnings, issue, importMs) {
  const contactResult = emptyContactResult();
  const featureResult = emptyFeatureResult();
  return {
    ok: false,
    contactResult,
    featureResult,
    diagnostics: {
      sourceName,
      modelHash,
      kernel: 'Open Cascade Technology 8 (occt-wasm 3.8.1)',
      counts: { bodies: 0, shells: 0, faces: 0, edges: 0, vertices: 0 },
      units,
      totalArea: areaUnits(0),
      bodies: [],
      faces: [],
      warnings,
      errors: [issue],
      validation: { isValid: false, openShellCount: 0, multiBody: false },
      contacts: publicContactsResult(contactResult),
      features: publicFeaturesResult(featureResult),
      exclusions: featureResult.summary,
      performance: { importMs: rounded(importMs), calculationMs: 0 },
    },
  };
}

function collectTopology(kernel, shape, modelHash) {
  const solids = uniqueByHash(kernel, kernel.getSubShapes(shape, 'solid'));
  const shells = uniqueByHash(kernel, kernel.getSubShapes(shape, 'shell'));
  const faces = uniqueByHash(kernel, kernel.getSubShapes(shape, 'face'));
  const edges = uniqueByHash(kernel, kernel.getSubShapes(shape, 'edge'));
  const vertices = uniqueByHash(kernel, kernel.getSubShapes(shape, 'vertex'));

  const bodyByFaceHash = new Map();
  const closedShellHashes = new Set();
  const bodies = solids.map((solid, bodyIndex) => {
    const bodyFaces = uniqueByHash(kernel, kernel.getSubShapes(solid, 'face'));
    const bodyShells = uniqueByHash(kernel, kernel.getSubShapes(solid, 'shell'));
    const bodyAreaMm2 = rounded(kernel.getSurfaceArea(solid));
    const bodyBounds = kernel.getBoundingBox(solid);
    const bodyFingerprint = `${bodyAreaMm2}:${bodyFaces.length}:${Object.values(bodyBounds).map(rounded).join(',')}`;
    const bodyId = stableEntityId('body', modelHash, bodyIndex, bodyFingerprint);
    for (const bodyFace of bodyFaces) bodyByFaceHash.set(entityHash(kernel, bodyFace), bodyId);
    for (const shell of bodyShells) closedShellHashes.add(entityHash(kernel, shell));
    const body = {
      id: bodyId,
      index: bodyIndex,
      area: areaUnits(bodyAreaMm2),
      shellCount: bodyShells.length,
      faceCount: bodyFaces.length,
      valid: kernel.isValid(solid),
    };
    releaseMany(kernel, bodyFaces);
    releaseMany(kernel, bodyShells);
    return body;
  });

  const faceReports = faces.map((face, faceIndex) => {
    const hash = entityHash(kernel, face);
    const areaMm2 = rounded(kernel.getSurfaceArea(face));
    const centerOfMass = kernel.getSurfaceCenterOfMass(face);
    const center = [rounded(centerOfMass.x), rounded(centerOfMass.y), rounded(centerOfMass.z)];
    const surfaceType = kernel.surfaceType(face);
    const fingerprint = `${areaMm2}:${surfaceType}:${center.join(',')}`;
    return {
      id: stableEntityId('face', modelHash, faceIndex, fingerprint),
      index: faceIndex,
      bodyId: bodyByFaceHash.get(hash) ?? null,
      surfaceType,
      centerMm: center,
      area: areaUnits(areaMm2),
    };
  });

  const openShellCount = shells.filter((shell) => !closedShellHashes.has(entityHash(kernel, shell))).length;
  const counts = {
    bodies: solids.length,
    shells: shells.length,
    faces: faces.length,
    edges: edges.length,
    vertices: vertices.length,
  };

  releaseMany(kernel, [...solids, ...shells, ...faces, ...edges, ...vertices]);
  return { counts, bodies, faces: faceReports, openShellCount };
}

export async function analyzeStepContent(content, sourceName = 'model.step', options = {}) {
  return serialize(async () => {
    const modelHash = createHash('sha256').update(content).digest('hex');
    const warnings = [];
    const errors = [];
    const units = detectStepUnits(content);
    if (units.assumed) warnings.push(diagnosticIssue('UNIT_ASSUMED_MM', 'Единицы STEP не определены; применено безопасное предположение: миллиметры'));

    const importStarted = performance.now();
    const envelopeIssue = validateStepEnvelope(content);
    if (envelopeIssue) {
      return failedAnalysis(
        sourceName,
        modelHash,
        units,
        warnings,
        envelopeIssue,
        performance.now() - importStarted,
      );
    }

    const kernel = await getKernel();
    let shape;
    try {
      shape = kernel.importStep(content);
    } catch (error) {
      return failedAnalysis(
        sourceName,
        modelHash,
        units,
        warnings,
        diagnosticIssue('CAD_IMPORT_FAILED', 'Не удалось прочитать STEP как B-Rep', { cause: error instanceof Error ? error.message : String(error) }),
        performance.now() - importStarted,
      );
    }

    const importMs = performance.now() - importStarted;
    const calculationStarted = performance.now();
    try {
      const topology = collectTopology(kernel, shape, modelHash);
      const isValid = kernel.isValid(shape);
      const totalAreaMm2 = rounded(kernel.getSurfaceArea(shape));
      const totalArea = areaUnits(totalAreaMm2);

      if (topology.counts.faces === 0) errors.push(diagnosticIssue('EMPTY_MODEL', 'Модель не содержит граней'));
      if (topology.counts.bodies === 0) errors.push(diagnosticIssue('NO_BODIES', 'Модель не содержит твердотельных тел'));
      if (topology.openShellCount > 0) errors.push(diagnosticIssue('OPEN_SHELLS', 'Обнаружены открытые оболочки', { count: topology.openShellCount }));
      if (!isValid) errors.push(diagnosticIssue('INVALID_BREP', 'Open Cascade обнаружил некорректный B-Rep'));
      if (topology.counts.bodies > 1) warnings.push(diagnosticIssue('MULTI_BODY_MODEL', 'Обнаружена многотельная модель', { count: topology.counts.bodies }));

      let contactResult = emptyContactResult(totalAreaMm2, topology.counts.bodies);
      if (errors.length === 0 && topology.counts.bodies > 1) {
        contactResult = detectContacts(
          kernel,
          shape,
          { ...topology, totalArea },
          loadContactConfig(options.contactConfig),
        );
      }
      const publicContactResult = publicContactsResult(contactResult);
      let featureResult = emptyFeatureResult(totalAreaMm2);
      if (errors.length === 0) {
        featureResult = detectFeatures(
          kernel,
          shape,
          { ...topology, totalArea, modelHash },
          loadFeatureConfig(options.featureConfig),
          contactResult,
        );
      }
      const publicFeatureResult = publicFeaturesResult(featureResult);
      const viewerMesh = errors.length === 0
        ? buildViewerMesh(kernel, shape, topology, contactResult, featureResult, options.viewerConfig ?? viewerConfig)
        : null;

      return {
        ok: errors.length === 0,
        contactResult,
        featureResult,
        viewerMesh,
        diagnostics: {
          sourceName,
          modelHash,
          kernel: 'Open Cascade Technology 8 (occt-wasm 3.8.1)',
          counts: topology.counts,
          units,
          totalArea,
          bodies: topology.bodies,
          faces: topology.faces,
          warnings,
          errors,
          validation: { isValid, openShellCount: topology.openShellCount, multiBody: topology.counts.bodies > 1 },
          contacts: publicContactResult,
          features: publicFeatureResult,
          exclusions: publicFeatureResult.summary,
          performance: {
            importMs: rounded(importMs),
            calculationMs: rounded(performance.now() - calculationStarted),
            broadPhaseMs: publicContactResult.statistics.broadPhaseMs,
            narrowPhaseMs: publicContactResult.statistics.narrowPhaseMs,
            contactClassificationMs: publicContactResult.statistics.classificationMs,
            contactDetectionMs: publicContactResult.statistics.totalContactProcessingMs,
            candidateExtractionMs: publicFeatureResult.statistics.candidateExtractionMs,
            holeRecognitionMs: publicFeatureResult.statistics.holeRecognitionMs,
            cavityRecognitionMs: publicFeatureResult.statistics.cavityRecognitionMs,
            featureRuleEvaluationMs: publicFeatureResult.statistics.ruleEvaluationMs,
            overlapResolutionMs: publicFeatureResult.statistics.overlapResolutionMs,
            featureProcessingMs: publicFeatureResult.statistics.totalFeatureProcessingMs,
          },
        },
      };
    } finally {
      kernel.release(shape);
    }
  });
}

export async function closeCadKernel() {
  await queue;
  if (!kernelPromise) return;
  const kernel = await kernelPromise;
  kernel.releaseAll();
  kernel[Symbol.dispose]();
  kernelPromise = undefined;
}
