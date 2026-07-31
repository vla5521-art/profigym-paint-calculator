const HASH_UPPER_BOUND = 2_147_483_647;
const CONFIRMED_FEATURE = new Set(['confirmed', 'manually_confirmed']);

function boundsFromPositions(positions) {
  const bounds = { xmin: Infinity, ymin: Infinity, zmin: Infinity, xmax: -Infinity, ymax: -Infinity, zmax: -Infinity };
  for (let index = 0; index < positions.length; index += 3) {
    bounds.xmin = Math.min(bounds.xmin, positions[index]);
    bounds.ymin = Math.min(bounds.ymin, positions[index + 1]);
    bounds.zmin = Math.min(bounds.zmin, positions[index + 2]);
    bounds.xmax = Math.max(bounds.xmax, positions[index]);
    bounds.ymax = Math.max(bounds.ymax, positions[index + 1]);
    bounds.zmax = Math.max(bounds.zmax, positions[index + 2]);
  }
  return bounds;
}

function extractGroup(mesh, indexStart, indexCount) {
  const vertexMap = new Map();
  const positions = [];
  const normals = [];
  const indices = [];
  for (let cursor = indexStart; cursor < indexStart + indexCount; cursor += 1) {
    const sourceIndex = mesh.indices[cursor];
    let targetIndex = vertexMap.get(sourceIndex);
    if (targetIndex === undefined) {
      targetIndex = vertexMap.size;
      vertexMap.set(sourceIndex, targetIndex);
      positions.push(
        mesh.positions[sourceIndex * 3],
        mesh.positions[sourceIndex * 3 + 1],
        mesh.positions[sourceIndex * 3 + 2],
      );
      normals.push(
        mesh.normals[sourceIndex * 3],
        mesh.normals[sourceIndex * 3 + 1],
        mesh.normals[sourceIndex * 3 + 2],
      );
    }
    indices.push(targetIndex);
  }
  return { positions, normals, indices, boundingBox: boundsFromPositions(positions) };
}

function faceState(faceId, faceAreaMm2, contacts, features, areaToleranceMm2) {
  const sourceFeatureIds = features.filter((feature) => feature.faceIds.includes(faceId)).map((feature) => feature.featureId);
  const sourceContactIds = contacts
    .filter((contact) => contact.faceAId === faceId || contact.faceBId === faceId)
    .map((contact) => contact.contactId);
  const confirmed = features.filter((feature) => CONFIRMED_FEATURE.has(feature.status) && feature.excludedFaceIds?.includes(faceId));
  const reviewed = features.filter((feature) => feature.status === 'review_required' && feature.faceIds.includes(faceId));
  const rejected = features.filter((feature) => ['rejected', 'manually_rejected'].includes(feature.status) && feature.faceIds.includes(faceId));
  if (confirmed.some((feature) => feature.featureType === 'manual_feature')) return { category: 'manual_excluded', status: 'confirmed', sourceFeatureIds, sourceContactIds };
  if (confirmed.some((feature) => feature.featureType.includes('cavity'))) return { category: 'cavity_excluded', status: 'confirmed', sourceFeatureIds, sourceContactIds };
  if (confirmed.some((feature) => feature.featureType.includes('hole'))) return { category: 'hole_excluded', status: 'confirmed', sourceFeatureIds, sourceContactIds };
  const fullContact = contacts.some((contact) => contact.status === 'confirmed'
    && (contact.faceAId === faceId || contact.faceBId === faceId)
    && contact.contactAreaMm2 >= faceAreaMm2 - areaToleranceMm2);
  if (fullContact) return { category: 'contact_excluded', status: 'confirmed', sourceFeatureIds, sourceContactIds };
  if (reviewed.length > 0 || contacts.some((contact) => contact.status === 'review_required' && (contact.faceAId === faceId || contact.faceBId === faceId))) {
    return { category: 'review_required', status: 'review_required', sourceFeatureIds, sourceContactIds };
  }
  if (rejected.length > 0) return { category: 'rejected', status: 'rejected', sourceFeatureIds, sourceContactIds };
  return { category: 'painted', status: 'included', sourceFeatureIds, sourceContactIds };
}

function tessellateWithinLimit(kernel, shape, config) {
  let linearDeflection = config.linearDeflectionMm;
  let angularDeflection = config.angularDeflectionDeg * Math.PI / 180;
  let mesh;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    mesh = kernel.meshShape(shape, { linearDeflection, angularDeflection, relative: false });
    if (mesh.triangleCount <= config.maxTriangles) {
      return { mesh, linearDeflection, angularDeflectionDeg: angularDeflection * 180 / Math.PI, simplified: attempt > 0 };
    }
    linearDeflection *= 2;
    angularDeflection = Math.min(Math.PI / 2, angularDeflection * 1.35);
  }
  return { mesh: null, linearDeflection, angularDeflectionDeg: angularDeflection * 180 / Math.PI, simplified: true };
}

function createPatchMeshes(kernel, contacts, config) {
  const patches = [];
  for (const contact of contacts.filter((item) => item.patchBrep && item.contactAreaMm2 > 0)) {
    const handle = kernel.fromBREP(contact.patchBrep);
    try {
      const mesh = kernel.tessellate(handle, {
        linearDeflection: config.linearDeflectionMm,
        angularDeflection: config.angularDeflectionDeg * Math.PI / 180,
      });
      patches.push({
        patchId: `patch_${contact.contactId}`,
        faceIds: [contact.faceAId, contact.faceBId],
        positions: [...mesh.positions],
        normals: [...mesh.normals],
        indices: [...mesh.indices],
        areaMm2: contact.contactAreaMm2,
        category: contact.status === 'confirmed' ? 'contact_excluded' : contact.status,
        status: contact.status,
        sourceContactIds: [contact.contactId],
      });
    } finally {
      kernel.release(handle);
    }
  }
  return patches;
}

export function buildViewerMesh(kernel, shape, topology, contactResult, featureResult, config) {
  const started = performance.now();
  const meshed = tessellateWithinLimit(kernel, shape, config);
  if (!meshed.mesh) {
    return {
      meshVersion: '1.0.0',
      available: false,
      warning: { code: 'VIEWER_MESH_TOO_LARGE', message: `Сетка превышает лимит ${config.maxTriangles} треугольников` },
      faces: [], patches: [], triangleCount: 0, payloadBytes: 0,
      settings: { linearDeflectionMm: meshed.linearDeflection, angularDeflectionDeg: meshed.angularDeflectionDeg, maxTriangles: config.maxTriangles },
      performance: { meshGenerationMs: Number((performance.now() - started).toFixed(3)), meshSerializationMs: 0 },
    };
  }
  const mesh = meshed.mesh;
  const faceHandles = kernel.getSubShapes(shape, 'face');
  const faceIdByHash = new Map(faceHandles.map((face, index) => [kernel.hashCode(face, HASH_UPPER_BOUND), topology.faces[index]?.id]));
  for (const face of faceHandles) kernel.release(face);
  const reportById = new Map(topology.faces.map((face) => [face.id, face]));
  const faces = [];
  for (let cursor = 0; cursor < (mesh.faceGroups?.length ?? 0); cursor += 3) {
    const indexStart = mesh.faceGroups[cursor];
    const indexCount = mesh.faceGroups[cursor + 1];
    const faceId = faceIdByHash.get(mesh.faceGroups[cursor + 2]);
    const report = reportById.get(faceId);
    if (!faceId || !report) continue;
    const geometry = extractGroup(mesh, indexStart, indexCount);
    faces.push({
      faceId,
      bodyId: report.bodyId,
      ...geometry,
      surfaceType: report.surfaceType,
      areaMm2: report.area.mm2,
      ...faceState(faceId, report.area.mm2, contactResult.contacts, featureResult.features, featureResult.summary?.areaToleranceMm2 ?? 0.01),
    });
  }
  const patches = createPatchMeshes(kernel, contactResult.contacts, config);
  const serialStarted = performance.now();
  const payloadBytes = Buffer.byteLength(JSON.stringify({ faces, patches }));
  const meshSerializationMs = performance.now() - serialStarted;
  return {
    meshVersion: '1.0.0',
    available: true,
    warning: meshed.simplified ? { code: 'VIEWER_MESH_SIMPLIFIED', message: 'Для соблюдения лимита применена более грубая сетка' } : null,
    faces,
    patches,
    triangleCount: mesh.triangleCount,
    vertexCount: mesh.vertexCount,
    payloadBytes,
    boundingBox: kernel.getBoundingBox(shape),
    settings: { linearDeflectionMm: meshed.linearDeflection, angularDeflectionDeg: meshed.angularDeflectionDeg, maxTriangles: config.maxTriangles },
    performance: {
      meshGenerationMs: Number((performance.now() - started).toFixed(3)),
      meshSerializationMs: Number(meshSerializationMs.toFixed(3)),
    },
  };
}

export function recolorViewerMesh(mesh, contacts, features, areaToleranceMm2 = 0.01) {
  if (!mesh?.available) return mesh;
  const next = structuredClone(mesh);
  next.faces = next.faces.map((face) => ({ ...face, ...faceState(face.faceId, face.areaMm2, contacts, features, areaToleranceMm2) }));
  const contactById = new Map(contacts.map((contact) => [contact.contactId, contact]));
  next.patches = next.patches.map((patch) => {
    const contact = contactById.get(patch.sourceContactIds[0]);
    return contact ? { ...patch, status: contact.status, category: contact.status === 'confirmed' ? 'contact_excluded' : contact.status } : patch;
  });
  return next;
}

export const viewerInternals = { boundsFromPositions, extractGroup, faceState, tessellateWithinLimit };
