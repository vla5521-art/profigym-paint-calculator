export function add(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

export function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

export function scale(vector, scalar) {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

export function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

export function magnitude(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function normalize(vector) {
  const length = magnitude(vector);
  if (length <= 1e-12) return null;
  let result = scale(vector, 1 / length);
  const first = [result.x, result.y, result.z].find((value) => Math.abs(value) > 1e-9);
  if (first < 0) result = scale(result, -1);
  return result;
}

export function angleDifferenceDeg(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const cosine = Math.max(-1, Math.min(1, Math.abs(dot(a, b))));
  return Math.acos(cosine) * 180 / Math.PI;
}

export function lineDistance(left, right) {
  const crossAxes = cross(left.direction, right.direction);
  const denominator = magnitude(crossAxes);
  const delta = subtract(right.origin, left.origin);
  if (denominator <= 1e-9) return magnitude(cross(delta, left.direction));
  return Math.abs(dot(delta, crossAxes)) / denominator;
}

export function rangesTouch(left, right, tolerance) {
  return left.min <= right.max + tolerance && right.min <= left.max + tolerance;
}

export function connectedComponents(items, connected) {
  const pending = new Set(items.map((_, index) => index));
  const groups = [];
  while (pending.size > 0) {
    const [seed] = pending;
    pending.delete(seed);
    const indexes = [seed];
    const queue = [seed];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const candidate of [...pending]) {
        if (!connected(items[current], items[candidate])) continue;
        pending.delete(candidate);
        indexes.push(candidate);
        queue.push(candidate);
      }
    }
    groups.push(indexes.map((index) => items[index]));
  }
  return groups;
}
