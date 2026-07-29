import { useMemo, useState } from "react";
import type { DatabaseRepository } from "../repository/DatabaseRepository";
import { calculateConsumption } from "../services/calculations";
import type { Material } from "../types/database";
import { parseNumberInput } from "../utils/formatNumber";
import type { CalculationResultView } from "./ResultCard";

interface FormErrors {
  manufacturer?: string;
  material?: string;
  area?: string;
  lossFactor?: string;
  general?: string;
}

interface CalculatorFormProps {
  repository: DatabaseRepository;
  onResult: (result: CalculationResultView | null) => void;
}

function resultUnitFromNormSymbol(symbol: string): string {
  if (symbol.includes("кг")) return "кг";
  if (symbol.includes("г/")) return "г";
  if (symbol.includes("мл")) return "мл";
  if (symbol.includes("л")) return "л";
  return symbol.replace("/м²", "");
}

export function CalculatorForm({ repository, onResult }: CalculatorFormProps): React.JSX.Element {
  const manufacturers = useMemo(() => repository.getManufacturers(), [repository]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [area, setArea] = useState("");
  const [lossFactor, setLossFactor] = useState("1.10");
  const [errors, setErrors] = useState<FormErrors>({});

  const materials: Material[] = useMemo(
    () => manufacturerId ? repository.getMaterialsByManufacturer(manufacturerId) : [],
    [manufacturerId, repository],
  );

  const parsedArea = parseNumberInput(area);
  const parsedLossFactor = parseNumberInput(lossFactor);
  const isFormValid = manufacturerId !== "" && materialId !== "" && parsedArea !== null && parsedArea > 0 && parsedLossFactor !== null && parsedLossFactor >= 1;

  function invalidateResult(): void { onResult(null); }

  function handleManufacturerChange(value: string): void {
    setManufacturerId(value);
    setMaterialId("");
    setErrors({});
    invalidateResult();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    const numericArea = parseNumberInput(area);
    const numericLoss = parseNumberInput(lossFactor);

    if (!manufacturerId) nextErrors.manufacturer = "Выберите производителя.";
    if (!materialId) nextErrors.material = "Выберите материал.";
    if (numericArea === null || numericArea <= 0) nextErrors.area = "Введите площадь больше нуля.";
    if (numericLoss === null || numericLoss < 1) nextErrors.lossFactor = "Коэффициент потерь не может быть меньше 1.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      onResult(null);
      return;
    }

    const manufacturer = repository.getManufacturer(manufacturerId);
    const material = repository.getMaterial(materialId);
    const norm = repository.getDefaultNorm(materialId);

    if (!manufacturer) nextErrors.general = "Выбранный производитель не найден в базе.";
    else if (!material) nextErrors.general = "Выбранный материал не найден в базе.";
    else if (!norm) nextErrors.general = "Для выбранного материала не найдена активная норма расхода.";
    else if (!Number.isFinite(norm.value_nominal) || norm.value_nominal <= 0) nextErrors.general = "Для выбранного материала указана некорректная норма расхода.";
    else {
      const unit = repository.getUnit(norm.unit_id);
      if (!unit) nextErrors.general = "Для нормы расхода не найдена единица измерения.";
      else {
        try {
          const calculation = calculateConsumption(numericArea as number, norm, numericLoss as number);
          onResult({
            manufacturerName: manufacturer.name,
            materialName: material.name,
            normValue: norm.value_nominal,
            normUnit: unit.symbol,
            resultUnit: resultUnitFromNormSymbol(unit.symbol),
            area: numericArea as number,
            lossFactor: numericLoss as number,
            calculation,
          });
        } catch (error: unknown) {
          nextErrors.general = error instanceof Error ? error.message : "Не удалось выполнить расчёт.";
        }
      }
    }

    setErrors(nextErrors);
  }

  function clearForm(): void {
    setManufacturerId("");
    setMaterialId("");
    setArea("");
    setLossFactor("1.10");
    setErrors({});
    onResult(null);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="fields-grid">
        <section className="field-card">
          <h2 className="field-title">Материал</h2>
          <label className="field-label" htmlFor="manufacturer">Производитель</label>
          <select id="manufacturer" value={manufacturerId} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => handleManufacturerChange(event.target.value)} aria-invalid={Boolean(errors.manufacturer)} aria-describedby="manufacturer-error">
            <option value="">Выберите производителя</option>
            {manufacturers.map((manufacturer) => <option key={manufacturer.manufacturer_id} value={manufacturer.manufacturer_id}>{manufacturer.name}</option>)}
          </select>
          <span id="manufacturer-error" className="field-error">{errors.manufacturer}</span>

          <label className="field-label" htmlFor="material">Наименование материала</label>
          <select id="material" value={materialId} disabled={!manufacturerId || materials.length === 0} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => { setMaterialId(event.target.value); setErrors({}); invalidateResult(); }} aria-invalid={Boolean(errors.material)} aria-describedby="material-error">
            <option value="">Выберите материал</option>
            {materials.map((material) => <option key={material.material_id} value={material.material_id}>{material.name}</option>)}
          </select>
          <span id="material-error" className="field-error">{errors.material ?? (manufacturerId && materials.length === 0 ? "Для выбранного производителя нет доступных материалов." : "")}</span>
        </section>

        <section className="field-card">
          <h2 className="field-title">Параметры расчёта</h2>
          <label className="field-label" htmlFor="area">Площадь окраски (м²)</label>
          <input id="area" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Например, 125.5" value={area} onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setArea(event.target.value); setErrors({}); invalidateResult(); }} aria-invalid={Boolean(errors.area)} aria-describedby="area-error" />
          <span id="area-error" className="field-error">{errors.area}</span>

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
