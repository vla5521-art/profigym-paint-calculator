export interface ConsumptionCalculation {
  theoreticalConsumption: number;
  totalConsumption: number;
}

export const MANUAL_CONSUMPTION_NORM_CONTRACT = Object.freeze({
  fieldLabel: "Норма расхода краски",
  normUnit: "кг/м²",
  resultUnit: "кг",
});

export function calculateConsumption(
  area: number,
  normKgPerM2: number,
  lossFactor: number,
): ConsumptionCalculation {
  if (!Number.isFinite(area) || area <= 0) {
    throw new RangeError("Площадь должна быть положительным числом.");
  }
  if (!Number.isFinite(normKgPerM2) || normKgPerM2 <= 0) {
    throw new RangeError("Норма расхода должна быть положительным числом.");
  }
  if (!Number.isFinite(lossFactor) || lossFactor < 1) {
    throw new RangeError("Коэффициент потерь должен быть числом не меньше 1.");
  }

  const theoreticalConsumption = area * normKgPerM2;
  const totalConsumption = theoreticalConsumption * lossFactor;

  return { theoreticalConsumption, totalConsumption };
}
