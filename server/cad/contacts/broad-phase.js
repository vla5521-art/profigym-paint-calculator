function compareId(left, right) {
  return left.id.localeCompare(right.id);
}

function expandedIntersects(a, b, tolerance) {
  return a.xmin - tolerance <= b.xmax
    && a.xmax + tolerance >= b.xmin
    && a.ymin - tolerance <= b.ymax
    && a.ymax + tolerance >= b.ymin
    && a.zmin - tolerance <= b.zmax
    && a.zmax + tolerance >= b.zmin;
}

function canonicalPair(left, right) {
  return left.id.localeCompare(right.id) <= 0 ? [left, right] : [right, left];
}

export function findBodyCandidates(bodies, toleranceMm) {
  const started = performance.now();
  const ordered = [...bodies].sort((left, right) => (
    left.bounds.xmin - right.bounds.xmin || compareId(left, right)
  ));
  const pairs = [];
  const seen = new Set();

  for (let index = 0; index < ordered.length; index += 1) {
    const left = ordered[index];
    for (let cursor = index + 1; cursor < ordered.length; cursor += 1) {
      const right = ordered[cursor];
      if (right.bounds.xmin > left.bounds.xmax + toleranceMm) break;
      if (!expandedIntersects(left.bounds, right.bounds, toleranceMm)) continue;
      const [bodyA, bodyB] = canonicalPair(left, right);
      const key = `${bodyA.id}|${bodyB.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ key, bodyA, bodyB });
    }
  }

  pairs.sort((left, right) => left.key.localeCompare(right.key));
  return {
    pairs,
    statistics: {
      bodyCount: bodies.length,
      potentialBodyPairCount: bodies.length * (bodies.length - 1) / 2,
      broadPhaseBodyPairCount: pairs.length,
      broadPhaseMs: Number((performance.now() - started).toFixed(6)),
    },
  };
}

export function findFaceCandidates(bodyPairs, toleranceMm) {
  const pairs = [];
  const seen = new Set();

  for (const { bodyA, bodyB } of bodyPairs) {
    const facesA = [...bodyA.faces].sort(compareId);
    const facesB = [...bodyB.faces].sort(compareId);
    for (const left of facesA) {
      for (const right of facesB) {
        if (!expandedIntersects(left.bounds, right.bounds, toleranceMm)) continue;
        const [faceA, faceB] = canonicalPair(left, right);
        const key = `${faceA.id}|${faceB.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ key, faceA, faceB });
      }
    }
  }

  pairs.sort((left, right) => left.key.localeCompare(right.key));
  return pairs;
}

export const broadPhaseInternals = { expandedIntersects, canonicalPair };
