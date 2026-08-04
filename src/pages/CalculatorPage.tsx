import { useState } from "react";
import type { PaintIntegration } from "../cad/api.ts";
import { CadUploadPanel } from "../components/CadUploadPanel.tsx";
import { CalculatorForm } from "../components/CalculatorForm.tsx";
import { Header } from "../components/Header.tsx";
import { ResultCard, type CalculationResultView } from "../components/ResultCard.tsx";
import { SavedCadCalculations } from "../components/cad-result/SavedCadCalculations.tsx";

export function CalculatorPage(): React.JSX.Element {
  const [result, setResult] = useState<CalculationResultView | null>(null);
  const [section, setSection] = useState<"paint" | "cad" | "saved">("paint");
  const [cadSource, setCadSource] = useState<PaintIntegration | null>(null);

  const useCadArea = (integration: PaintIntegration) => {
    setCadSource(integration);
    setResult(null);
    setSection("paint");
  };

  return (
    <main className="page-shell">
      <section className="calculator" aria-labelledby="page-title">
        <Header />
        <nav className="main-navigation" aria-label="Основные разделы">
          <button className={section === "paint" ? "is-active" : ""} type="button" onClick={() => setSection("paint")}>Калькулятор ЛКМ</button>
          <button className={section === "cad" ? "is-active" : ""} type="button" onClick={() => setSection("cad")}>CAD-расчёт площади</button>
          <button className={section === "saved" ? "is-active" : ""} type="button" onClick={() => setSection("saved")}>Сохранённые CAD-расчёты</button>
        </nav>
        {section === "cad" && <CadUploadPanel onPaintIntegration={useCadArea} />}
        {section === "saved" && <SavedCadCalculations onPaintIntegration={useCadArea} />}
        {section === "paint" && <>
          <CalculatorForm onResult={setResult} cadSource={cadSource} onReturnToCad={() => setSection("saved")} />
          <ResultCard result={result} />
        </>}
        {section === "paint" && <aside className="formula-card">
          <div className="info-icon" aria-hidden="true">i</div>
          <div>
            <p>Расчёт выполняется по введённой норме расхода:</p>
            <strong>Площадь × Норма расхода × Коэффициент потерь = Необходимое количество материала</strong>
          </div>
        </aside>}
      </section>
    </main>
  );
}
