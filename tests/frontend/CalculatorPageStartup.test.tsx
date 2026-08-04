import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalculatorPage } from "../../src/pages/CalculatorPage.tsx";

afterEach(() => vi.restoreAllMocks());

describe("CalculatorPage startup", () => {
  it("renders the manual-norm calculator immediately without startup requests", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    render(<CalculatorPage />);

    expect(screen.getByLabelText("Норма расхода краски")).toBeInTheDocument();
    expect(screen.getByLabelText("Площадь окраски (м²)")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps CAD and saved calculations available through navigation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    render(<CalculatorPage />);
    fireEvent.click(screen.getByRole("button", { name: "CAD-расчёт площади" }));
    expect(screen.getByLabelText("CAD-файл")).toHaveAttribute("accept", ".stp,.step");

    fireEvent.click(screen.getByRole("button", { name: "Сохранённые CAD-расчёты" }));
    expect(screen.getByRole("heading", { name: "Сохранённые CAD-расчёты" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cad/calculations?search=&sort=updated_desc"));
  });
});
