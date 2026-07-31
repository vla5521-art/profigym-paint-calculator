import { createHash } from 'node:crypto';

const HASH_UPPER_BOUND = 2_147_483_647;

function rounded(value) {
  return Number(value.toFixed(9));
}

function stableEdgeId(modelHash, length, center, curveType) {
  const fingerprint = `${curveType}:${rounded(length)}:${center.map(rounded).join(':')}`;
  return `edge_${createHash('sha256').update(`${modelHash}:${fingerprint}`).digest('hex').slice(0, 24)}`;
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

function insideBounds(inner, outer, tolerance) {
  return inner.xmin > outer.xmin + tolerance
    && inner.xmax < outer.xmax - tolerance
    && inner.ymin > outer.ymin + tolerance
    && inner.ymax < outer.ymax - tolerance
    && inner.zmin > outer.zmin + tolerance
    && inner.zmax < outer.zmax - tolerance;
}

export function extractFeatureCandidates(kernel, shape, topology, config) {
  const solids = uniqueByHash(kernel, kernel.getSubShapes(shape, 'solid'));
  const allFaces = uniqueByHash(kernel, kernel.getSubShapes(shape, 'face'));
  const faceByHash = new Map();
  const edgeByHash = new Map();

  allFaces.forEach((face, index) => {
    const report = topology.faces[index];
    const edges = uniqueByHash(kernel, kernel.getSubShapes(face, 'edge'));
    const edgeIds = [];
    for (const edge of edges) {
      const hash = kernel.hashCode(edge, HASH_UPPER_BOUND);
      let entry = edgeByHash.get(hash);
      if (!entry) {
        const center = kernel.getLinearCenterOfMass(edge);
        entry = {
          id: stableEdgeId(
            topology.modelHash,
            kernel.getLength(edge),
            [center.x, center.y, center.z],
            kernel.curveType(edge),
          ),
          hash,
          curveType: kernel.curveType(edge),
          lengthMm: kernel.getLength(edge),
          faceIds: [],
        };
        edgeByHash.set(hash, entry);
      }
      entry.faceIds.push(report.id);
      edgeIds.push(entry.id);
    }
    for (const edge of edges) kernel.release(edge);

    const uv = kernel.uvBounds(face);
    faceByHash.set(kernel.hashCode(face, HASH_UPPER_BOUND), {
      handle: face,
      id: report.id,
      bodyId: report.bodyId,
      surfaceType: report.surfaceType,
      orientation: kernel.shapeOrientation(face),
      areaMm2: report.area.mm2,
      center: { x: report.centerMm[0], y: report.centerMm[1], z: report.centerMm[2] },
      bounds: kernel.getBoundingBox(face),
      uv,
      edgeIds: edgeIds.sort(),
      brep: kernel.toBREP(face),
    });
  });

  const bodies = solids.map((solid, index) => {
    const report = topology.bodies[index];
    const faceHandles = uniqueByHash(kernel, kernel.getSubShapes(solid, 'face'));
    const faces = faceHandles
      .map((face) => faceByHash.get(kernel.hashCode(face, HASH_UPPER_BOUND)))
      .filter(Boolean);
    for (const face of faceHandles) kernel.release(face);

    const bounds = kernel.getBoundingBox(solid);
    const shellHandles = uniqueByHash(kernel, kernel.getSubShapes(solid, 'shell'));
    const shells = shellHandles.map((shell) => {
      const shellFaces = uniqueByHash(kernel, kernel.getSubShapes(shell, 'face'));
      const faceIds = shellFaces
        .map((face) => faceByHash.get(kernel.hashCode(face, HASH_UPPER_BOUND))?.id)
        .filter(Boolean)
        .sort();
      for (const face of shellFaces) kernel.release(face);
      const shellBounds = kernel.getBoundingBox(shell);
      return {
        faceIds,
        bounds: shellBounds,
        closedInternal: insideBounds(shellBounds, bounds, config.axisToleranceMm),
      };
    });
    for (const shell of shellHandles) kernel.release(shell);

    return { id: report.id, handle: solid, bounds, faces, shells };
  });

  const faces = [...faceByHash.values()];
  const faceById = new Map(faces.map((face) => [face.id, face]));
  const edges = [...edgeByHash.values()].map((edge) => ({
    ...edge,
    faceIds: [...new Set(edge.faceIds)].sort(),
  }));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));

  return {
    bodies,
    faces,
    faceById,
    edges,
    edgeById,
    faceCatalog: faces.map((face) => ({
      id: face.id,
      bodyId: face.bodyId,
      areaMm2: face.areaMm2,
      surfaceType: face.surfaceType,
      brep: face.brep,
    })),
    release() {
      for (const solid of solids) kernel.release(solid);
      for (const face of allFaces) kernel.release(face);
    },
  };
}

export const candidateInternals = { insideBounds };
