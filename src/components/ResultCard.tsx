import type { ConsumptionCalculation } from "../services/calculations.ts";
import { formatNumber } from "../utils/formatNumber.ts";
import { printCalculation } from "../utils/printCalculation.ts";

export interface CalculationResultView {
  manufacturerName: string;
  materialName: string;
  normValue: number;
  normUnit: string;
  resultUnit: string;
  area: number;
  lossFactor: number;
  calculation: ConsumptionCalculation;
}

interface ResultCardProps { result: CalculationResultView | null; }

export function ResultCard({ result }: ResultCardProps): React.JSX.Element {
  return (
    <section className="result-card" aria-live="polite" aria-atomic="true">
      <h2>Результат</h2>
      {result ? (
        <>
          <div className="result-value">
            <span>{formatNumber(result.calculation.totalConsumption, 2)}</span>
            <span className="result-unit">{result.resultUnit}</span>
          </div>
          <p className="result-caption">Необходимое количество материала</p>
          <dl className="result-details">
            <div><dt>Производитель</dt><dd>{result.manufacturerName}</dd></div>
            <div><dt>Материал</dt><dd>{result.materialName}</dd></div>
            <div><dt>Норма расхода</dt><dd>{formatNumber(result.normValue, 3)} {result.normUnit}</dd></div>
            <div><dt>Площадь</dt><dd>{formatNumber(result.area, 2)} м²</dd></div>
            <div><dt>Коэффициент потерь</dt><dd>{formatNumber(result.lossFactor, 2)}</dd></div>
            <div><dt>Теоретический расход</dt><dd>{formatNumber(result.calculation.theoreticalConsumption, 2)} {result.resultUnit}</dd></div>
          </dl>
          <div className="result-actions no-print">
            <button className="print-button" type="button" onClick={printCalculation}>
              <span aria-hidden="true">▣</span>
              <span>Печать расчёта</span>
            </button>
          </div>
          <p className="print-note print-only">Расчёт сформирован в PROFiGYM</p>
        </>
      ) : (
        <>
          <div className="result-value placeholder-result"><span>0,00</span><span className="result-unit">кг</span></div>
          <p className="result-caption">Выберите материал и выполните расчёт</p>
        </>
      )}
    </section>
  );
}
