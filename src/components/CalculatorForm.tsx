import { useEffect, useState } from "react";
import type { PaintIntegration } from "../cad/api.ts";
import { calculateConsumption } from "../services/calculations.ts";
import { parseNumberInput } from "../utils/formatNumber.ts";
import type { CalculationResultView } from "./ResultCard.tsx";

interface FormErrors {
  norm?: string;
  area?: string;
  lossFactor?: string;
  general?: string;
}

interface CalculatorFormProps {
  onResult: (result: CalculationResultView | null) => void;
  cadSource?: PaintIntegration | null;
  onReturnToCad?: () => void;
}

export function CalculatorForm({ onResult, cadSource, onReturnToCad }: CalculatorFormProps): React.JSX.Element {
  const [norm, setNorm] = useState("");
  const [area, setArea] = useState("");
  const [lossFactor, setLossFactor] = useState("1.10");
  const [errors, setErrors] = useState<FormErrors>({});
  const [cadAreaOverridden, setCadAreaOverridden] = useState(false);

  useEffect(() => {
    if (!cadSource) return;
    setArea(String(cadSource.paintableAreaM2));
    setCadAreaOverridden(false);
    setErrors({});
  }, [cadSource]);

  const parsedNorm = parseNumberInput(norm);
  const parsedArea = parseNumberInput(area);
  const parsedLossFactor = parseNumberInput(lossFactor);
  const isFormValid = parsedNorm !== null && parsedNorm > 0 && parsedArea !== null && parsedArea > 0 && parsedLossFactor !== null && parsedLossFactor >= 1;

  function invalidateResult(): void { onResult(null); }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    const numericNorm = parseNumberInput(norm);
    const numericArea = parseNumberInput(area);
    const numericLoss = parseNumberInput(lossFactor);

    if (norm.trim() === "") nextErrors.norm = "Введите норму расхода краски.";
    else if (numericNorm === null || numericNorm <= 0) nextErrors.norm = "Введите положительное конечное число.";
    if (numericArea === null || numericArea <= 0) nextErrors.area = "Введите площадь больше нуля.";
    if (numericLoss === null || numericLoss < 1) nextErrors.lossFactor = "Коэффициент потерь не может быть меньше 1.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      onResult(null);
      return;
    }

    try {
      const calculation = calculateConsumption(numericArea as number, numericNorm as number, numericLoss as number);
      onResult({
        normKgPerM2: numericNorm as number,
        area: numericArea as number,
        lossFactor: numericLoss as number,
        calculation,
      });
    } catch (error: unknown) {
      nextErrors.general = error instanceof Error ? error.message : "Не удалось выполнить расчёт.";
    }

    setErrors(nextErrors);
  }

  function clearForm(): void {
    setNorm("");
    setArea("");
    setCadAreaOverridden(Boolean(cadSource));
    setLossFactor("1.10");
    setErrors({});
    onResult(null);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="fields-grid">
        <section className="field-card">
          <h2 className="field-title">Норма расхода</h2>
          <label className="field-label" htmlFor="consumption-norm">Норма расхода краски</label>
          <div className="input-with-unit">
            <input id="consumption-norm" type="text" inputMode="decimal" placeholder="Например, 0,20" value={norm} onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setNorm(event.target.value); setErrors({}); invalidateResult(); }} aria-invalid={Boolean(errors.norm)} aria-describedby="norm-error" />
            <span aria-hidden="true">кг/м²</span>
          </div>
          <span id="norm-error" className="field-error">{errors.norm}</span>
        </section>

        <section className="field-card">
          <h2 className="field-title">Параметры расчёта</h2>
          <label className="field-label" htmlFor="area">Площадь окраски (м²)</label>
          <input id="area" data-testid="paint-area-input" type="number" min="0.000001" step="0.000001" inputMode="decimal" placeholder="Например, 125.5" value={area} onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setArea(event.target.value); setCadAreaOverridden(Boolean(cadSource) && Number(event.target.value) !== cadSource?.paintableAreaM2); setErrors({}); invalidateResult(); }} aria-invalid={Boolean(errors.area)} aria-describedby="area-error cad-area-source" />
          <span id="area-error" className="field-error">{errors.area}</span>
          {cadSource && <div id="cad-area-source" data-testid="paint-area-source" data-calculation-id={cadSource.calculationId} data-source-file={cadSource.sourceFileName} data-overridden={cadAreaOverridden} className={`cad-area-source ${cadAreaOverridden ? "is-overridden" : ""}`}>
            <strong>Источник площади: CAD-расчёт</strong><span>{cadSource.sourceFileName}</span><code>{cadSource.calculationId}</code><span>{new Date(cadSource.calculatedAt).toLocaleString("ru-RU")}</span>
            {cadAreaOverridden && <em>Площадь изменена вручную после импорта.</em>}
            {cadSource.warning && <small>{cadSource.warning}</small>}
            <button type="button" onClick={onReturnToCad}>Вернуться к CAD-расчёту</button>
          </div>}

          <label className="field-label" htmlFor="loss-factor">Коэффициент потерь</label>
          <input id="loss-factor" type="number" min="1" step="0.01" inputMode="decimal" value={lossFactor} onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setLossFactor(event.target.value); setErrors({}); invalidateResult(); }} aria-invalid={Boolean(errors.lossFactor)} aria-describedby="loss-error loss-hint" />
          <small id="loss-hint" className="field-hint">1.10 соответствует запасу 10%</small>
          <span id="loss-error" className="field-error">{errors.lossFactor}</span>
        </section>
      </div>

      {errors.general && <div className="form-error" role="alert">{errors.general}</div>}

      <div className="form-actions">
        <button className="calculate-button" type="submit" disabled={!isFormValid}><span className="calc-icon" aria-hidden="true">▦</span><span>РАССЧИТАТЬ РАСХОД КРАСКИ</span></button>
        <button className="clear-button" type="button" onClick={clearForm}>Очистить</button>
      </div>
    </form>
  );
}
