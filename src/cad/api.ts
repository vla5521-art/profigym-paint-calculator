export type CadJobStatus = "queued" | "processing" | "retry_wait" | "completed" | "failed" | "timed_out" | "cancelled";

export interface AreaValue {
  mm2: number;
  cm2: number;
  m2: number;
}

export interface DiagnosticIssue {
  code: string;
  message: string;
  details: unknown;
}

export type ContactStatus = "confirmed" | "review_required" | "rejected";
export type ContactType =
  | "full_planar_contact"
  | "partial_planar_contact"
  | "cylindrical_contact"
  | "tangent_contact"
  | "near_gap"
  | "ambiguous_contact";

export interface CadContact {
  contactId: string;
  bodyAId: string;
  bodyBId: string;
  faceAId: string;
  faceBId: string;
  contactType: ContactType;
  contactAreaMm2: number;
  physicalContactAreaMm2: number;
  potentialContactAreaMm2: number;
  excludedPaintAreaMm2: number;
  distanceMm: number;
  angleDifferenceDeg: number | null;
  toleranceMm: number;
  confidence: number;
  status: ContactStatus;
  manualDecision: ContactStatus | null;
  reason: string;
  createdAt: string;
}

export interface ContactSummary {
  totalAreaMm2: number;
  confirmedPhysicalContactAreaMm2: number;
  confirmedExcludedPaintAreaMm2: number;
  reviewRequiredPhysicalAreaMm2: number;
  paintableAreaMm2: number;
  totalArea: AreaValue;
  confirmedPhysicalContactArea: AreaValue;
  confirmedExcludedPaintArea: AreaValue;
  reviewRequiredPhysicalArea: AreaValue;
  paintableArea: AreaValue;
}

export interface ContactResult {
  contacts: CadContact[];
  summary: ContactSummary;
  statistics: {
    bodyCount: number;
    potentialBodyPairCount: number;
    broadPhaseBodyPairCount: number;
    narrowPhaseCandidateCount: number;
    exactCheckCount: number;
    broadPhaseMs: number;
    narrowPhaseMs: number;
    classificationMs: number;
    totalContactProcessingMs: number;
  };
}

export type FeatureStatus =
  | "confirmed"
  | "review_required"
  | "rejected"
  | "manually_confirmed"
  | "manually_rejected";

export type FeatureType =
  | "through_hole"
  | "blind_hole"
  | "stepped_hole"
  | "countersunk_hole"
  | "counterbored_hole"
  | "intersecting_holes"
  | "closed_internal_cavity"
  | "open_internal_cavity"
  | "slot"
  | "ambiguous_feature"
  | "manual_feature";

export interface CadFeature {
  featureId: string;
  bodyId: string;
  featureType: FeatureType;
  faceIds: string[];
  sideFaceIds: string[];
  bottomFaceIds: string[];
  transitionFaceIds: string[];
  openingEdgeIds: string[];
  axis: { originMm: number[]; direction: number[] } | null;
  diameterMm: number | null;
  radiusMm: number | null;
  depthMm: number | null;
  through: boolean;
  accessible: boolean | null;
  closed: boolean | null;
  excludedAreaMm2: number;
  potentialAreaMm2: number;
  confidence: number;
  status: FeatureStatus;
  initialStatus: FeatureStatus;
  manualDecision: FeatureStatus | null;
  reason: string;
  ruleId: string;
  createdAt: string;
  segments: Array<{ faceIds: string[]; diameterMm: number; depthMm: number }>;
  diametersMm: number[];
  depthsMm: number[];
}

export interface ExclusionSummary {
  totalAreaMm2: number;
  confirmedPhysicalContactAreaMm2: number;
  confirmedContactExcludedAreaMm2: number;
  confirmedHoleExcludedAreaMm2: number;
  confirmedCavityExcludedAreaMm2: number;
  confirmedManualExcludedAreaMm2: number;
  reviewRequiredFeatureAreaMm2: number;
  rawContactExcludedAreaMm2: number;
  rawFeatureExcludedAreaMm2: number;
  rawExcludedAreaMm2: number;
  overlapAreaMm2: number;
  uniqueConfirmedExcludedAreaMm2: number;
  paintableAreaMm2: number;
  totalArea: AreaValue;
  confirmedPhysicalContactArea: AreaValue;
  confirmedContactExcludedArea: AreaValue;
  confirmedHoleExcludedArea: AreaValue;
  confirmedCavityExcludedArea: AreaValue;
  confirmedManualExcludedArea: AreaValue;
  reviewRequiredFeatureArea: AreaValue;
  rawExcludedArea: AreaValue;
  overlapArea: AreaValue;
  uniqueConfirmedExcludedArea: AreaValue;
  paintableArea: AreaValue;
}

export interface FeatureResult {
  features: CadFeature[];
  summary: ExclusionSummary;
  statistics: {
    candidateExtractionMs: number;
    holeRecognitionMs: number;
    cavityRecognitionMs: number;
    ruleEvaluationMs: number;
    overlapResolutionMs: number;
    totalFeatureProcessingMs: number;
    featureCandidateCount: number;
    confirmedFeatureCount: number;
    reviewRequiredCount: number;
  };
}

export interface FeatureRules {
  autoExcludeEnabled: boolean;
  holeMinDiameterMm: number;
  holeMaxDiameterMm: number;
  holeMinDepthMm: number;
  holeMaxDepthMm: number;
  excludeThrough: boolean;
  excludeBlind: boolean;
  excludeBottomFace: boolean;
  excludeCountersink: boolean;
  excludeCounterbore: boolean;
  excludeClosedCavity: boolean;
  openCavityReviewRequired: boolean;
  confidenceThreshold: number;
  areaToleranceMm2: number;
  axisToleranceMm: number;
  angleToleranceDeg: number;
}

export interface CadDiagnostics {
  sourceName: string;
  kernel: string;
  counts: { bodies: number; shells: number; faces: number; edges: number; vertices: number };
  units: { source: string; symbol: string; millimetersPerUnit: number; normalizedTo: string; assumed?: boolean };
  totalArea: AreaValue;
  bodies: Array<{ id: string; index: number; area: AreaValue; shellCount: number; faceCount: number; valid: boolean }>;
  faces: Array<{ id: string; index: number; bodyId: string | null; surfaceType: string; centerMm: number[]; area: AreaValue }>;
  warnings: DiagnosticIssue[];
  errors: DiagnosticIssue[];
  validation: { isValid: boolean; openShellCount: number; multiBody: boolean };
  contacts: ContactResult;
  features: FeatureResult;
  exclusions: ExclusionSummary;
  performance: {
    uploadMs: number;
    importMs: number;
    calculationMs: number;
    totalMs: number;
    broadPhaseMs: number;
    narrowPhaseMs: number;
    contactClassificationMs: number;
    contactDetectionMs: number;
    candidateExtractionMs: number;
    holeRecognitionMs: number;
    cavityRecognitionMs: number;
    featureRuleEvaluationMs: number;
    overlapResolutionMs: number;
    featureProcessingMs: number;
  };
}

export interface CadJob {
  id: string;
  status: CadJobStatus;
  originalName: string;
  size: number;
  extension: string;
  createdAt: string;
  updatedAt: string;
  errorCode?: string | null;
  publicError?: string | null;
  error: DiagnosticIssue | null;
  area: AreaValue | null;
  paintableArea: AreaValue | null;
  diagnostics: CadDiagnostics | null;
  featureRules: FeatureRules | null;
}

export type ViewerCategory = "painted" | "contact_excluded" | "hole_excluded" | "cavity_excluded" | "manual_excluded" | "review_required" | "rejected" | "selected";

export interface ViewerFace {
  faceId: string;
  bodyId: string | null;
  positions: number[];
  normals: number[];
  indices: number[];
  boundingBox: { xmin: number; ymin: number; zmin: number; xmax: number; ymax: number; zmax: number };
  surfaceType: string;
  areaMm2: number;
  category: ViewerCategory;
  status: string;
  sourceFeatureIds: string[];
  sourceContactIds: string[];
}

export interface ViewerPatch {
  patchId: string;
  faceIds: string[];
  positions: number[];
  normals: number[];
  indices: number[];
  areaMm2: number;
  category: ViewerCategory;
  status: string;
  sourceContactIds: string[];
}

export interface ViewerMesh {
  meshVersion: string;
  available: boolean;
  warning: DiagnosticIssue | null;
  faces: ViewerFace[];
  patches: ViewerPatch[];
  triangleCount: number;
  vertexCount: number;
  payloadBytes: number;
  boundingBox?: { xmin: number; ymin: number; zmin: number; xmax: number; ymax: number; zmax: number };
  settings: { linearDeflectionMm: number; angularDeflectionDeg: number; maxTriangles: number };
  performance: { meshGenerationMs: number; meshSerializationMs: number };
}

export interface PaintIntegration {
  paintableAreaMm2: number;
  paintableAreaM2: number;
  calculationId: string;
  sourceFileName: string;
  calculatedAt: string;
  algorithmVersion: string;
  source: "cad_calculation";
  warning: string | null;
}

export interface SavedCadCalculation {
  calculationId: string;
  name: string;
  status: CadJobStatus;
  createdAt: string;
  updatedAt: string;
  sourceFileName: string;
  sourceFileHash: string;
  sourceFileSize: number;
  revisionNumber: number;
  applicationVersion: string;
  algorithmVersion: string;
  versions: Record<string, string>;
  diagnostics: CadDiagnostics;
  contacts: CadContact[];
  contactSummary: ContactSummary;
  features: CadFeature[];
  featureSummary: ExclusionSummary;
  featureRules: FeatureRules;
  contactSettings: Record<string, number | boolean>;
  warnings: DiagnosticIssue[];
  paintIntegration: PaintIntegration | null;
  viewerMeshUrl: string;
  reportJsonUrl: string;
  reportHtmlUrl: string;
  preview: { available: boolean; mime?: string; width?: number; height?: number; sizeBytes?: number; url?: string };
}

export interface SavedCalculationListItem {
  calculationId: string;
  name: string;
  sourceFileName: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  totalArea: AreaValue;
  paintableArea: AreaValue;
  warningCount: number;
  algorithmVersion: string;
  revisionNumber: number;
}

export interface CadReport {
  id: string;
  status: CadJobStatus;
  generatedAt: string;
  source: { name: string; sizeBytes: number; format: string };
  area: AreaValue;
  paintableArea: AreaValue;
  diagnostics: CadDiagnostics;
  contacts: CadContact[];
  contactSummary: ContactSummary;
  features: CadFeature[];
  featureSummary: ExclusionSummary;
  featureRules: FeatureRules;
}

export interface CadApiError {
  error: { code: string; message: string; details: unknown; requestId: string };
}

const API_BASE = import.meta.env.VITE_CAD_API_URL ?? "";

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T | CadApiError;
  if (!response.ok) throw new Error("error" in (payload as CadApiError) ? (payload as CadApiError).error.message : `HTTP ${response.status}`);
  return payload as T;
}

export async function uploadCadFile(file: File): Promise<CadJob> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}/api/cad/import`, { method: "POST", body: form });
  const payload = await readJson<{ job: CadJob }>(response);
  return payload.job;
}

export async function getCadJob(id: string): Promise<CadJob> {
  const response = await fetch(`${API_BASE}/api/cad/job/${encodeURIComponent(id)}`);
  const payload = await readJson<{ job: CadJob }>(response);
  return payload.job;
}

export async function getCadReport(id: string): Promise<CadReport> {
  const response = await fetch(`${API_BASE}/api/cad/report/${encodeURIComponent(id)}`);
  const payload = await readJson<{ report: CadReport }>(response);
  return payload.report;
}

export async function getJobViewerMesh(id: string): Promise<ViewerMesh> {
  const response = await fetch(`${API_BASE}/api/cad/report/${encodeURIComponent(id)}/viewer-mesh`);
  const payload = await readJson<{ mesh: ViewerMesh }>(response);
  return payload.mesh;
}

export async function saveCadCalculation(jobId: string, name: string): Promise<SavedCadCalculation> {
  const response = await fetch(`${API_BASE}/api/cad/calculations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, name }) });
  return (await readJson<{ calculation: SavedCadCalculation }>(response)).calculation;
}

export async function listCadCalculations(search = ""): Promise<SavedCalculationListItem[]> {
  const response = await fetch(`${API_BASE}/api/cad/calculations?search=${encodeURIComponent(search)}&sort=updated_desc`);
  return (await readJson<{ items: SavedCalculationListItem[] }>(response)).items;
}

export async function getSavedCadCalculation(id: string): Promise<SavedCadCalculation> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}`);
  return (await readJson<{ calculation: SavedCadCalculation }>(response)).calculation;
}

export async function getSavedViewerMesh(id: string): Promise<ViewerMesh> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}/viewer-mesh`);
  return (await readJson<{ mesh: ViewerMesh }>(response)).mesh;
}

export async function renameCadCalculation(id: string, name: string): Promise<SavedCadCalculation> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
  return (await readJson<{ calculation: SavedCadCalculation }>(response)).calculation;
}

export async function duplicateCadCalculation(id: string): Promise<SavedCadCalculation> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
  return (await readJson<{ calculation: SavedCadCalculation }>(response)).calculation;
}

export async function deleteCadCalculation(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) await readJson(response);
}

export async function recalculateSavedCadCalculation(id: string, options: { featureRules?: Partial<FeatureRules>; preserveManualDecisions?: boolean; preserveReviewDecisions?: boolean } = {}): Promise<SavedCadCalculation> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}/recalculate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(options) });
  return (await readJson<{ calculation: SavedCadCalculation }>(response)).calculation;
}

export async function integrateCadWithPaint(id: string, confirmed: boolean): Promise<PaintIntegration> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}/integrate-paint`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed }) });
  return (await readJson<{ integration: PaintIntegration }>(response)).integration;
}

export async function uploadCadReportPreview(id: string, preview: Blob): Promise<void> {
  const form = new FormData();
  form.append("preview", preview, "cad-preview.png");
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}/preview`, { method: "POST", body: form });
  await readJson<{ preview: { available: boolean } }>(response);
}

export async function decideSavedCadEntities(id: string, entityType: "contact" | "feature", ids: string[], decision: "confirm" | "reject" | "reset"): Promise<SavedCadCalculation> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}/decisions/bulk`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entityType, ids, decision }) });
  return (await readJson<{ calculation: SavedCadCalculation }>(response)).calculation;
}

export async function createSavedManualFeature(id: string, faceIds: string[]): Promise<SavedCadCalculation> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}/features/manual`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ faceIds }) });
  return (await readJson<{ calculation: SavedCadCalculation }>(response)).calculation;
}

export async function deleteSavedManualFeature(id: string, featureId: string): Promise<SavedCadCalculation> {
  const response = await fetch(`${API_BASE}/api/cad/calculations/${encodeURIComponent(id)}/features/${encodeURIComponent(featureId)}`, { method: "DELETE" });
  return (await readJson<{ calculation: SavedCadCalculation }>(response)).calculation;
}

export async function getCadContacts(id: string): Promise<ContactResult> {
  const response = await fetch(`${API_BASE}/api/cad/report/${encodeURIComponent(id)}/contacts`);
  return readJson<ContactResult>(response);
}

export async function decideCadContact(
  jobId: string,
  contactId: string,
  decision: "confirm" | "reject" | "reset",
): Promise<ContactResult> {
  const response = await fetch(
    `${API_BASE}/api/cad/report/${encodeURIComponent(jobId)}/contacts/${encodeURIComponent(contactId)}/${decision}`,
    { method: "POST" },
  );
  return readJson<ContactResult>(response);
}

export async function getCadFeatures(id: string): Promise<FeatureResult> {
  const response = await fetch(`${API_BASE}/api/cad/report/${encodeURIComponent(id)}/features`);
  return readJson<FeatureResult>(response);
}

export async function decideCadFeature(
  jobId: string,
  featureId: string,
  decision: "confirm" | "reject" | "reset",
): Promise<FeatureResult> {
  const response = await fetch(
    `${API_BASE}/api/cad/report/${encodeURIComponent(jobId)}/features/${encodeURIComponent(featureId)}/${decision}`,
    { method: "POST" },
  );
  return readJson<FeatureResult>(response);
}

export async function createManualCadFeature(jobId: string, faceIds: string[]): Promise<FeatureResult> {
  const response = await fetch(`${API_BASE}/api/cad/report/${encodeURIComponent(jobId)}/features/manual`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ faceIds }),
  });
  return readJson<FeatureResult>(response);
}

export async function deleteManualCadFeature(jobId: string, featureId: string): Promise<FeatureResult> {
  const response = await fetch(
    `${API_BASE}/api/cad/report/${encodeURIComponent(jobId)}/features/${encodeURIComponent(featureId)}`,
    { method: "DELETE" },
  );
  return readJson<FeatureResult>(response);
}

export async function updateCadFeatureRules(
  jobId: string,
  patch: Partial<FeatureRules>,
): Promise<{ rules: FeatureRules; result: FeatureResult }> {
  const response = await fetch(`${API_BASE}/api/cad/report/${encodeURIComponent(jobId)}/feature-rules`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return readJson<{ rules: FeatureRules; result: FeatureResult }>(response);
}
