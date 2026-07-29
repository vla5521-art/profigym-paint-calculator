import { useState } from "react";
import { CalculatorForm } from "../components/CalculatorForm.tsx";
import { DemoWarning } from "../components/DemoWarning.tsx";
import { ErrorState } from "../components/ErrorState.tsx";
import { ExcelImportPanel } from "../components/ExcelImportPanel.tsx";
import { Header } from "../components/Header.tsx";
import { LoadingState } from "../components/LoadingState.tsx";
import { ResultCard, type CalculationResultView } from "../components/ResultCard.tsx";
import { useDatabase } from "../hooks/useDatabase.ts";

export function CalculatorPage(): React.JSX.Element {
  const { loading, error, repository, reload } = useDatabase();
  const [result, setResult] = useState<CalculationResultView | null>(null);

  return (
    <main className="page-shell">
      <section className="calculator" aria-labelledby="page-title">
        <Header />
        {loading && <LoadingState />}
        {!loading && error && <ErrorState error={error} onReload={() => { void reload(); }} />}
        {!loading && !error && repository && (
          <>
            <DemoWarning metadata={repository.getMetadata()} />
            <ExcelImportPanel repository={repository} onDatabaseChanged={reload} />
            <CalculatorForm repository={repository} onResult={setResult} />
            <ResultCard result={result} />
            <aside className="formula-card">
              <div className="info-icon" aria-hidden="true">i</div>
              <div>
                <p>Расчёт выполняется по выбранной норме материала:</p>
                <strong>Площадь × Норма расхода × Коэффициент потерь = Необходимое количество материала</strong>
              </div>
            </aside>
          </>
        )}
      </section>
    </main>
  );
}
