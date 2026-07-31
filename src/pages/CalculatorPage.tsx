import { useState } from "react";
import type { PaintIntegration } from "../cad/api.ts";
import { CadUploadPanel } from "../components/CadUploadPanel.tsx";
import { CalculatorForm } from "../components/CalculatorForm.tsx";
import { DemoWarning } from "../components/DemoWarning.tsx";
import { ErrorState } from "../components/ErrorState.tsx";
import { ExcelImportPanel } from "../components/ExcelImportPanel.tsx";
import { Header } from "../components/Header.tsx";
import { LoadingState } from "../components/LoadingState.tsx";
import { ResultCard, type CalculationResultView } from "../components/ResultCard.tsx";
import { useDatabase } from "../hooks/useDatabase.ts";
import { SavedCadCalculations } from "../components/cad-result/SavedCadCalculations.tsx";

export function CalculatorPage(): React.JSX.Element {
  const { loading, error, repository, reload } = useDatabase();
  const [result, setResult] = useState<CalculationResultView | null>(null);
  const [section, setSection] = useState<"paint" | "cad" | "saved">("cad");
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
        {loading && <LoadingState />}
        {!loading && error && <ErrorState error={error} onReload={() => { void reload(); }} />}
        {!loading && !error && repository && (
          <>
            <DemoWarning metadata={repository.getMetadata()} />
            <nav className="main-navigation" aria-label="Основные разделы">
              <button className={section === "paint" ? "is-active" : ""} type="button" onClick={() => setSection("paint")}>Калькулятор ЛКМ</button>
              <button className={section === "cad" ? "is-active" : ""} type="button" onClick={() => setSection("cad")}>CAD-расчёт площади</button>
              <button className={section === "saved" ? "is-active" : ""} type="button" onClick={() => setSection("saved")}>Сохранённые CAD-расчёты</button>
            </nav>
            {section === "cad" && <CadUploadPanel onPaintIntegration={useCadArea} />}
            {section === "saved" && <SavedCadCalculations onPaintIntegration={useCadArea} />}
            {section === "paint" && <>
              <ExcelImportPanel repository={repository} onDatabaseChanged={reload} />
              <CalculatorForm repository={repository} onResult={setResult} cadSource={cadSource} onReturnToCad={() => setSection("saved")} />
              <ResultCard result={result} />
            </>}
            {section === "paint" && <aside className="formula-card">
              <div className="info-icon" aria-hidden="true">i</div>
              <div>
                <p>Расчёт выполняется по выбранной норме материала:</p>
                <strong>Площадь × Норма расхода × Коэффициент потерь = Необходимое количество материала</strong>
              </div>
            </aside>}
          </>
        )}
      </section>
    </main>
  );
}
