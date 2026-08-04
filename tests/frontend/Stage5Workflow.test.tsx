import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CadViewer } from "../../src/components/cad-viewer/CadViewer.tsx";
import { VIEWER_CATEGORIES } from "../../src/components/cad-viewer/colors.ts";
import { CalculatorForm } from "../../src/components/CalculatorForm.tsx";
import { ResultCard, type CalculationResultView } from "../../src/components/ResultCard.tsx";
import { SavedCadCalculations } from "../../src/components/cad-result/SavedCadCalculations.tsx";
import type { PaintIntegration, ViewerMesh } from "../../src/cad/api.ts";

afterEach(() => vi.restoreAllMocks());

function PaintCalculatorHarness({ cadSource = null, onReturnToCad = () => undefined }: { cadSource?: PaintIntegration | null; onReturnToCad?: () => void }): React.JSX.Element {
  const [result, setResult] = useState<CalculationResultView | null>(null);
  return <><CalculatorForm onResult={setResult} cadSource={cadSource} onReturnToCad={onReturnToCad} /><ResultCard result={result} /></>;
}

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
    const onReturnToCad = vi.fn();
    const source: PaintIntegration = {
      paintableAreaMm2: 1_250_000, paintableAreaM2: 1.25, calculationId: "11111111-1111-4111-8111-111111111111",
      sourceFileName: "detail.step", calculatedAt: "2026-07-31T10:00:00.000Z", algorithmVersion: "geometry-2.0/contact-3.0/feature-4.0", source: "cad_calculation", warning: null,
    };
    render(<CalculatorForm onResult={() => undefined} cadSource={source} onReturnToCad={onReturnToCad} />);
    const input = screen.getByLabelText("Площадь окраски (м²)");
    expect(input).toHaveValue(1.25);
    expect(screen.getByText("Источник площади: CAD-расчёт")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к CAD-расчёту" }));
    expect(onReturnToCad).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { value: "2" } });
    expect(screen.getByText("Площадь изменена вручную после импорта.")).toBeInTheDocument();
  });

  it("calculates from manual area, fractional manual norm and loss factor, displays, clears and recalculates", () => {
    render(<PaintCalculatorHarness />);

    const normInput = screen.getByLabelText("Норма расхода краски");
    expect(normInput).toHaveAttribute("inputmode", "decimal");
    expect(normInput.parentElement).toHaveTextContent("кг/м²");
    fireEvent.change(normInput, { target: { value: "0,20" } });
    fireEvent.change(screen.getByLabelText("Площадь окраски (м²)"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Коэффициент потерь"), { target: { value: "1.10" } });
    fireEvent.click(screen.getByRole("button", { name: "РАССЧИТАТЬ РАСХОД КРАСКИ" }));

    expect(screen.getByText("2,2")).toBeInTheDocument();
    expect(screen.getByText("Необходимое количество материала")).toBeInTheDocument();
    expect(screen.getByText("0,2 кг/м²")).toBeInTheDocument();
    expect(screen.getByText("2 кг")).toBeInTheDocument();
    expect(screen.getByText("2,2 кг")).toBeInTheDocument();
    expect(screen.queryByText("Производитель")).not.toBeInTheDocument();
    expect(screen.queryByText("Материал")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Площадь окраски (м²)"), { target: { value: "5" } });
    expect(screen.getByText("Введите параметры и выполните расчёт")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "РАССЧИТАТЬ РАСХОД КРАСКИ" }));
    expect(screen.getByText("1,1 кг")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
    expect(screen.getByLabelText("Норма расхода краски")).toHaveValue("");
    expect(screen.getByLabelText("Площадь окраски (м²)")).toHaveValue(null);
    expect(screen.getByLabelText("Коэффициент потерь")).toHaveValue(1.1);
    expect(screen.getByText("Введите параметры и выполните расчёт")).toBeInTheDocument();
  });

  it("uses the paintable CAD area with a manual norm without requiring the norm for CAD itself", () => {
    const source: PaintIntegration = {
      paintableAreaMm2: 1_250_000, paintableAreaM2: 1.25, calculationId: "22222222-2222-4222-8222-222222222222",
      sourceFileName: "saved-detail.step", calculatedAt: "2026-08-01T10:00:00.000Z", algorithmVersion: "geometry-2.0/contact-3.0/feature-4.0", source: "saved_calculation", warning: null,
    };
    render(<PaintCalculatorHarness cadSource={source} />);

    expect(screen.getByLabelText("Площадь окраски (м²)")).toHaveValue(1.25);
    expect(screen.getByText("Источник площади: CAD-расчёт")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "РАССЧИТАТЬ РАСХОД КРАСКИ" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Норма расхода краски"), { target: { value: "0.25" } });
    fireEvent.change(screen.getByLabelText("Коэффициент потерь"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "РАССЧИТАТЬ РАСХОД КРАСКИ" }));

    expect(screen.getByText("0,31")).toBeInTheDocument();
    expect(screen.getByText("1,25 м²")).toBeInTheDocument();
    expect(screen.getByTestId("paint-area-source")).toHaveAttribute("data-overridden", "false");
  });

  it("rejects empty, non-positive and non-finite manual norms with understandable messages", () => {
    const { container } = render(<CalculatorForm onResult={() => undefined} />);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form as HTMLFormElement);
    expect(screen.getByText("Введите норму расхода краски.")).toBeInTheDocument();

    for (const invalidValue of ["0", "-0.1", "NaN", "Infinity", "не число"]) {
      fireEvent.change(screen.getByLabelText("Норма расхода краски"), { target: { value: invalidValue } });
      fireEvent.submit(form as HTMLFormElement);
      expect(screen.getByText("Введите положительное конечное число.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "РАССЧИТАТЬ РАСХОД КРАСКИ" })).toBeDisabled();
    }
  });

  it("shows safe empty state for persisted calculations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<SavedCadCalculations onPaintIntegration={() => undefined} />);
    await waitFor(() => expect(screen.getByText("Сохранённых CAD-расчётов пока нет.")).toBeInTheDocument());
    expect(screen.getByLabelText("Поиск по названию")).toBeInTheDocument();
  });
});
