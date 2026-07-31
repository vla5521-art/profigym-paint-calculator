import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CadViewer } from "../../src/components/cad-viewer/CadViewer.tsx";
import { VIEWER_CATEGORIES } from "../../src/components/cad-viewer/colors.ts";
import { CalculatorForm } from "../../src/components/CalculatorForm.tsx";
import { SavedCadCalculations } from "../../src/components/cad-result/SavedCadCalculations.tsx";
import type { DatabaseRepository } from "../../src/repository/DatabaseRepository.ts";
import type { PaintIntegration, ViewerMesh } from "../../src/cad/api.ts";

afterEach(() => vi.restoreAllMocks());

describe("Stage 5 workflow frontend", () => {
  it("renders accessible legend categories and WebGL fallback without hiding data", async () => {
    const mesh: ViewerMesh = {
      meshVersion: "1.0.0", available: true, warning: null, faces: [], patches: [], triangleCount: 0, vertexCount: 0, payloadBytes: 0,
      settings: { linearDeflectionMm: 0.15, angularDeflectionDeg: 20, maxTriangles: 750000 },
      performance: { meshGenerationMs: 1, meshSerializationMs: 1 },
    };
    render(<CadViewer mesh={mesh} selectedFaceIds={[]} onSelectFace={() => undefined} />);
    const legend = screen.getByLabelText("Легенда категорий");
    for (const [key, category] of Object.entries(VIEWER_CATEGORIES)) {
      if (key !== "selected") expect(legend).toHaveTextContent(category.label);
    }
    expect(await screen.findByText(/WebGL недоступен/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ортографическая" })).toBeInTheDocument();
  });

  it("imports CAD area into paint calculator and marks a subsequent manual override", () => {
    const repository = {
      getManufacturers: () => [],
      getMaterialsByManufacturer: () => [],
    } as unknown as DatabaseRepository;
    const source: PaintIntegration = {
      paintableAreaMm2: 1_250_000, paintableAreaM2: 1.25, calculationId: "11111111-1111-4111-8111-111111111111",
      sourceFileName: "detail.step", calculatedAt: "2026-07-31T10:00:00.000Z", algorithmVersion: "geometry-2.0/contact-3.0/feature-4.0", source: "cad_calculation", warning: null,
    };
    render(<CalculatorForm repository={repository} onResult={() => undefined} cadSource={source} />);
    const input = screen.getByLabelText("Площадь окраски (м²)");
    expect(input).toHaveValue(1.25);
    expect(screen.getByText("Источник площади: CAD-расчёт")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "2" } });
    expect(screen.getByText("Площадь изменена вручную после импорта.")).toBeInTheDocument();
  });

  it("shows safe empty state for persisted calculations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<SavedCadCalculations onPaintIntegration={() => undefined} />);
    await waitFor(() => expect(screen.getByText("Сохранённых CAD-расчётов пока нет.")).toBeInTheDocument());
    expect(screen.getByLabelText("Поиск по названию")).toBeInTheDocument();
  });
});

