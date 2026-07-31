const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const viewerConfig = Object.freeze({
  linearDeflectionMm: envNumber('CAD_VIEWER_LINEAR_DEFLECTION_MM', 0.15),
  angularDeflectionDeg: envNumber('CAD_VIEWER_ANGULAR_DEFLECTION_DEG', 20),
  maxTriangles: Math.floor(envNumber('CAD_VIEWER_MAX_TRIANGLES', 750_000)),
  meshCacheTtlMs: envNumber('CAD_VIEWER_MESH_CACHE_TTL_MS', 24 * 60 * 60 * 1000),
});

