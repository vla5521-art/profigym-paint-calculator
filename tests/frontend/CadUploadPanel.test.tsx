import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CadUploadPanel } from "../../src/components/CadUploadPanel.tsx";

const diagnostics = {
  sourceName: "cube.step",
  kernel: "Open Cascade Technology 8",
  counts: { bodies: 1, shells: 1, faces: 6, edges: 12, vertices: 8 },
  units: { source: "mm", symbol: "mm", millimetersPerUnit: 1, normalizedTo: "mm" },
  totalArea: { mm2: 600, cm2: 6, m2: 0.0006 },
  bodies: [],
  faces: [{ id: "face_123", index: 0, bodyId: "body_1", surfaceType: "plane", centerMm: [0, 5, 5], area: { mm2: 100, cm2: 1, m2: 0.0001 } }],
  warnings: [{ code: "MODEL_WARNING", message: "Проверьте геометрию модели" }],
  errors: [],
  validation: { isValid: true, openShellCount: 0, multiBody: false },
  contacts: {
    contacts: [{
      contactId: "contact_1",
      bodyAId: "body_1",
      bodyBId: "body_2",
      faceAId: "face_1",
      faceBId: "face_2",
      contactType: "near_gap",
      contactAreaMm2: 100,
      physicalContactAreaMm2: 0,
      potentialContactAreaMm2: 100,
      excludedPaintAreaMm2: 0,
      distanceMm: 0.02,
      angleDifferenceDeg: 0,
      toleranceMm: 0.05,
      confidence: 0.5,
      status: "review_required",
      manualDecision: null,
      reason: "Малый положительный зазор",
      createdAt: "",
    }],
    summary: {
      totalAreaMm2: 600,
      confirmedPhysicalContactAreaMm2: 0,
      confirmedExcludedPaintAreaMm2: 0,
      reviewRequiredPhysicalAreaMm2: 100,
      paintableAreaMm2: 600,
      totalArea: { mm2: 600, cm2: 6, m2: 0.0006 },
      confirmedPhysicalContactArea: { mm2: 0, cm2: 0, m2: 0 },
      confirmedExcludedPaintArea: { mm2: 0, cm2: 0, m2: 0 },
      reviewRequiredPhysicalArea: { mm2: 100, cm2: 1, m2: 0.0001 },
      paintableArea: { mm2: 600, cm2: 6, m2: 0.0006 },
    },
    statistics: {
      bodyCount: 2,
      potentialBodyPairCount: 1,
      broadPhaseBodyPairCount: 1,
      narrowPhaseCandidateCount: 1,
      exactCheckCount: 1,
      broadPhaseMs: 1,
      narrowPhaseMs: 2,
      classificationMs: 0.1,
      totalContactProcessingMs: 3.1,
    },
  },
  performance: {
    uploadMs: 2,
    importMs: 11,
    calculationMs: 3,
    totalMs: 16,
    broadPhaseMs: 1,
    narrowPhaseMs: 2,
    contactClassificationMs: 0.1,
    contactDetectionMs: 3.1,
  },
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CadUploadPanel", () => {
  it("allows only STEP in the file picker and states the supported formats", () => {
    render(<CadUploadPanel />);
    expect(screen.getByLabelText("CAD-файл")).toHaveAttribute("accept", ".stp,.step");
    expect(screen.getByText(/Поддерживаемые форматы: STEP \(\.stp, \.step\)/)).toBeInTheDocument();
  });

  it("shows processing status, area and diagnostics", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ job: { id: "job-1", status: "queued", originalName: "cube.step", size: 10, extension: ".step", createdAt: "", updatedAt: "", error: null, area: null, paintableArea: null, diagnostics: null } }, 202))
      .mockResolvedValueOnce(response({ job: { id: "job-1", status: "completed", originalName: "cube.step", size: 10, extension: ".step", createdAt: "", updatedAt: "", error: null, area: diagnostics.totalArea, paintableArea: diagnostics.contacts.summary.paintableArea, diagnostics } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CadUploadPanel />);
    const file = new File(["STEP"], "cube.step", { type: "application/step" });
    fireEvent.change(screen.getByLabelText("CAD-файл"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Импортировать/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("в очереди");
    const details = await screen.findByTestId("cad-details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Основные площади CAD-расчёта").children).toHaveLength(2);
    expect(screen.getByTestId("cad-review-required-indicator")).toHaveTextContent("Требуют проверки: 1");
    expect(screen.getByLabelText("Предупреждения")).not.toBe(details);
    expect(screen.getByLabelText("Предупреждения").closest("details")).toBeNull();
    fireEvent.click(screen.getByText("Подробнее"));
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Диагностический отчет")).toBeInTheDocument();
    expect(screen.getAllByText("0,0006 м²")).toHaveLength(2);
    expect(screen.getByText("face_123")).toBeInTheDocument();
    expect(screen.getByText("Контактные исключения")).toBeInTheDocument();
    expect(screen.getByText("Малый зазор")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подтвердить исключение" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отклонить" })).toBeInTheDocument();
  });

  it("confirms and resets a review-required contact without re-uploading STEP", async () => {
    const confirmed = {
      ...diagnostics.contacts,
      contacts: [{
        ...diagnostics.contacts.contacts[0],
        status: "confirmed",
        manualDecision: "confirmed",
        excludedPaintAreaMm2: 200,
      }],
      summary: {
        ...diagnostics.contacts.summary,
        confirmedPhysicalContactAreaMm2: 100,
        confirmedExcludedPaintAreaMm2: 200,
        reviewRequiredPhysicalAreaMm2: 0,
        paintableAreaMm2: 400,
        confirmedPhysicalContactArea: { mm2: 100, cm2: 1, m2: 0.0001 },
        confirmedExcludedPaintArea: { mm2: 200, cm2: 2, m2: 0.0002 },
        reviewRequiredPhysicalArea: { mm2: 0, cm2: 0, m2: 0 },
        paintableArea: { mm2: 400, cm2: 4, m2: 0.0004 },
      },
    };
    const reset = diagnostics.contacts;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ job: { id: "job-1", status: "queued", originalName: "gap.step", size: 10, extension: ".step", createdAt: "", updatedAt: "", error: null, area: null, paintableArea: null, diagnostics: null } }, 202))
      .mockResolvedValueOnce(response({ job: { id: "job-1", status: "completed", originalName: "gap.step", size: 10, extension: ".step", createdAt: "", updatedAt: "", error: null, area: diagnostics.totalArea, paintableArea: diagnostics.contacts.summary.paintableArea, diagnostics } }))
      .mockResolvedValueOnce(response(confirmed))
      .mockResolvedValueOnce(response(reset));
    vi.stubGlobal("fetch", fetchMock);

    render(<CadUploadPanel />);
    fireEvent.change(screen.getByLabelText("CAD-файл"), { target: { files: [new File(["STEP"], "gap.step")] } });
    fireEvent.click(screen.getByRole("button", { name: /Импортировать/ }));
    fireEvent.click(await screen.findByText("Подробнее"));
    await screen.findByRole("button", { name: "Подтвердить исключение" });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить исключение" }));
    expect(await screen.findByRole("button", { name: "Сбросить решение" })).toBeInTheDocument();
    expect(screen.getByText("0,0004 м²")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сбросить решение" }));
    expect(await screen.findByRole("button", { name: "Подтвердить исключение" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("shows client validation errors", () => {
    render(<CadUploadPanel />);
    const file = new File(["x"], "malware.exe");
    fireEvent.change(screen.getByLabelText("CAD-файл"), { target: { files: [file] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Поддерживаемые форматы: STEP (.stp, .step)");
  });

  it("shows API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "CAD_IMPORT_FAILED", message: "Поврежденная геометрия", details: null, requestId: "req-1" } }, 422)));
    render(<CadUploadPanel />);
    fireEvent.change(screen.getByLabelText("CAD-файл"), { target: { files: [new File(["STEP"], "bad.step")] } });
    fireEvent.click(screen.getByRole("button", { name: /Импортировать/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Поврежденная геометрия"));
  });
});
