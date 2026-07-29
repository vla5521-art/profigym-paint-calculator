import { useState } from "react";
import { CalculatorForm } from "../components/CalculatorForm";
import { DemoWarning } from "../components/DemoWarning";
import { ErrorState } from "../components/ErrorState";
import { Header } from "../components/Header";
import { LoadingState } from "../components/LoadingState";
import { ResultCard, type CalculationResultView } from "../components/ResultCard";
import { useDatabase } from "../hooks/useDatabase";

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
