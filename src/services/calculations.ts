import type { ConsumptionNorm } from "../types/database.ts";

export interface ConsumptionCalculation {
  theoreticalConsumption: number;
  totalConsumption: number;
}

export function calculateConsumption(
  area: number,
  norm: ConsumptionNorm,
  lossFactor: number,
): ConsumptionCalculation {
  if (!Number.isFinite(area) || area <= 0) {
    throw new RangeError("Площадь должна быть положительным числом.");
  }
  if (!Number.isFinite(norm.value_nominal) || norm.value_nominal <= 0) {
    throw new RangeError("Норма расхода должна быть положительным числом.");
  }
  if (!Number.isFinite(lossFactor) || lossFactor < 1) {
    throw new RangeError("Коэффициент потерь должен быть числом не меньше 1.");
  }

  const theoreticalConsumption = area * norm.value_nominal;
  const totalConsumption = theoreticalConsumption * lossFactor;

  return { theoreticalConsumption, totalConsumption };
}
