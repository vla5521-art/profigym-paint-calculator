import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CadUploadPanel } from "../../src/components/CadUploadPanel.tsx";

const zero = { mm2: 0, cm2: 0, m2: 0 };
const total = { mm2: 1000, cm2: 10, m2: 0.001 };
const paintable = { mm2: 800, cm2: 8, m2: 0.0008 };
const rules = {
  autoExcludeEnabled: true,
  holeMinDiameterMm: 0.5,
  holeMaxDiameterMm: 1000,
  holeMinDepthMm: 0.5,
  holeMaxDepthMm: 1000,
  excludeThrough: true,
  excludeBlind: true,
  excludeBottomFace: false,
  excludeCountersink: true,
  excludeCounterbore: true,
  excludeClosedCavity: true,
  openCavityReviewRequired: true,
  confidenceThreshold: 0.9,
  areaToleranceMm2: 0.01,
  axisToleranceMm: 0.05,
  angleToleranceDeg: 1,
};
const feature = {
  featureId: "feature_1",
  bodyId: "body_1",
  featureType: "open_internal_cavity",
  faceIds: ["face_1"],
  sideFaceIds: ["face_1"],
  bottomFaceIds: [],
  transitionFaceIds: [],
  openingEdgeIds: ["edge_1"],
  axis: null,
  diameterMm: null,
  radiusMm: null,
  depthMm: null,
  through: false,
  accessible: true,
  closed: false,
  excludedAreaMm2: 0,
  potentialAreaMm2: 200,
  confidence: 0.78,
  status: "review_required",
  initialStatus: "review_required",
  manualDecision: null,
  reason: "Полость имеет внешний проём",
  ruleId: "OPEN_CAVITY_POLICY",
  createdAt: "",
  segments: [],
  diametersMm: [],
  depthsMm: [],
};
const summary = {
  totalAreaMm2: 1000,
  confirmedPhysicalContactAreaMm2: 0,
  confirmedContactExcludedAreaMm2: 0,
  confirmedHoleExcludedAreaMm2: 0,
  confirmedCavityExcludedAreaMm2: 0,
  confirmedManualExcludedAreaMm2: 0,
  reviewRequiredFeatureAreaMm2: 200,
  rawContactExcludedAreaMm2: 0,
  rawFeatureExcludedAreaMm2: 0,
  rawExcludedAreaMm2: 0,
  overlapAreaMm2: 0,
  uniqueConfirmedExcludedAreaMm2: 0,
  paintableAreaMm2: 1000,
  totalArea: total,
  confirmedPhysicalContactArea: zero,
  confirmedContactExcludedArea: zero,
  confirmedHoleExcludedArea: zero,
  confirmedCavityExcludedArea: zero,
  confirmedManualExcludedArea: zero,
  reviewRequiredFeatureArea: { mm2: 200, cm2: 2, m2: 0.0002 },
  rawExcludedArea: zero,
  overlapArea: zero,
  uniqueConfirmedExcludedArea: zero,
  paintableArea: total,
};
const featureResult = {
  features: [feature],
  summary,
  statistics: {
    candidateExtractionMs: 1,
    holeRecognitionMs: 1,
    cavityRecognitionMs: 1,
    ruleEvaluationMs: 1,
    overlapResolutionMs: 1,
    totalFeatureProcessingMs: 5,
    featureCandidateCount: 1,
    confirmedFeatureCount: 0,
    reviewRequiredCount: 1,
  },
};
const contacts = {
  contacts: [],
  summary: {
    totalAreaMm2: 1000,
    confirmedPhysicalContactAreaMm2: 0,
    confirmedExcludedPaintAreaMm2: 0,
    reviewRequiredPhysicalAreaMm2: 0,
    paintableAreaMm2: 1000,
    totalArea: total,
    confirmedPhysicalContactArea: zero,
    confirmedExcludedPaintArea: zero,
    reviewRequiredPhysicalArea: zero,
    paintableArea: total,
  },
  statistics: {
    bodyCount: 1,
    potentialBodyPairCount: 0,
    broadPhaseBodyPairCount: 0,
    narrowPhaseCandidateCount: 0,
    exactCheckCount: 0,
    broadPhaseMs: 0,
    narrowPhaseMs: 0,
    classificationMs: 0,
    totalContactProcessingMs: 0,
  },
};
const diagnostics = {
  sourceName: "feature.step",
  kernel: "Open Cascade Technology 8",
  counts: { bodies: 1, shells: 1, faces: 1, edges: 4, vertices: 4 },
  units: { source: "mm", symbol: "mm", millimetersPerUnit: 1, normalizedTo: "mm" },
  totalArea: total,
  bodies: [],
  faces: [{ id: "face_1", index: 0, bodyId: "body_1", surfaceType: "plane", centerMm: [0, 0, 0], area: { mm2: 200, cm2: 2, m2: 0.0002 } }],
  warnings: [],
  errors: [],
  validation: { isValid: true, openShellCount: 0, multiBody: false },
  contacts,
  features: featureResult,
  exclusions: summary,
  performance: {
    uploadMs: 1, importMs: 1, calculationMs: 1, totalMs: 3,
    broadPhaseMs: 0, narrowPhaseMs: 0, contactClassificationMs: 0, contactDetectionMs: 0,
    candidateExtractionMs: 1, holeRecognitionMs: 1, cavityRecognitionMs: 1,
    featureRuleEvaluationMs: 1, overlapResolutionMs: 1, featureProcessingMs: 5,
  },
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function queuedJob() {
  return { id: "job-1", status: "queued", originalName: "feature.step", size: 10, extension: ".step", createdAt: "", updatedAt: "", error: null, area: null, paintableArea: null, diagnostics: null, featureRules: null };
}

function completedJob(overrides = {}) {
  return { ...queuedJob(), status: "completed", area: total, paintableArea: total, diagnostics, featureRules: rules, ...overrides };
}

async function renderCompleted(extraResponses: Response[] = []) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ job: queuedJob() }, 202))
    .mockResolvedValueOnce(response({ job: completedJob() }));
  for (const item of extraResponses) fetchMock.mockResolvedValueOnce(item);
  vi.stubGlobal("fetch", fetchMock);
  render(<CadUploadPanel />);
  fireEvent.change(screen.getByLabelText("CAD-файл"), { target: { files: [new File(["STEP"], "feature.step")] } });
  fireEvent.click(screen.getByRole("button", { name: /Импортировать/ }));
  fireEvent.click(await screen.findByText("Подробнее"));
  await screen.findByText("Технологические элементы");
  return fetchMock;
}

afterEach(() => vi.restoreAllMocks());

describe("Stage 4 feature frontend", () => {
  it("renders all Stage 4 area cards and the recognized feature table", async () => {
    await renderCompleted();
    expect(screen.getByText("Исключено по отверстиям")).toBeInTheDocument();
    expect(screen.getByText("Исключено по внутренним полостям")).toBeInTheDocument();
    expect(screen.getByText("Ручные исключения")).toBeInTheDocument();
    expect(screen.getByText("Перекрытие исключений")).toBeInTheDocument();
    expect(screen.getByText("Уникально исключённая площадь")).toBeInTheDocument();
    expect(screen.getByText(/Окрашиваемая площадь = Полная площадь/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Требуют проверки" })).toBeInTheDocument();
    expect(screen.getByLabelText("Поиск по ID")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подтвердить выбранные" })).toBeDisabled();
    expect(screen.getByText("Открытая внутренняя полость")).toBeInTheDocument();
    expect(screen.getByText("Полость имеет внешний проём")).toBeInTheDocument();
  });

  it("confirms a review-required feature and refreshes the combined area", async () => {
    const confirmedResult = {
      ...featureResult,
      features: [{ ...feature, status: "manually_confirmed", manualDecision: "manually_confirmed", excludedAreaMm2: 200 }],
      summary: { ...summary, confirmedCavityExcludedAreaMm2: 200, confirmedCavityExcludedArea: { mm2: 200, cm2: 2, m2: 0.0002 }, reviewRequiredFeatureAreaMm2: 0, reviewRequiredFeatureArea: zero, rawFeatureExcludedAreaMm2: 200, rawExcludedAreaMm2: 200, rawExcludedArea: { mm2: 200, cm2: 2, m2: 0.0002 }, uniqueConfirmedExcludedAreaMm2: 200, uniqueConfirmedExcludedArea: { mm2: 200, cm2: 2, m2: 0.0002 }, paintableAreaMm2: 800, paintableArea: paintable },
    };
    await renderCompleted([response(confirmedResult), response(confirmedResult)]);
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить исключение" }));
    expect(await screen.findByText("Подтвержден вручную")).toBeInTheDocument();
    expect(screen.getByText("0,0008 м²")).toBeInTheDocument();
  });

  it("updates per-job feature rules from the rules panel", async () => {
    const changedRules = { ...rules, holeMinDiameterMm: 9 };
    const fetchMock = await renderCompleted([response({ rules: changedRules, result: featureResult })]);
    fireEvent.click(screen.getByText("Правила технологических исключений"));
    fireEvent.change(screen.getByLabelText("Минимальный диаметр"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить правила" }));
    await screen.findByDisplayValue("9");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
  });

  it("creates a manual feature from selected face rows", async () => {
    const manual = { ...feature, featureId: "manual_1", featureType: "manual_feature", status: "manually_confirmed", manualDecision: "manually_confirmed", excludedAreaMm2: 200, confidence: 1 };
    await renderCompleted([response({ ...featureResult, features: [feature, manual] }, 201)]);
    fireEvent.click(screen.getByText("Грани и ручное исключение"));
    fireEvent.click(screen.getByLabelText("Выбрать грань face_1"));
    fireEvent.click(screen.getByRole("button", { name: "Создать ручное исключение (1)" }));
    expect(await screen.findByText("Ручное исключение")).toBeInTheDocument();
  });
});
