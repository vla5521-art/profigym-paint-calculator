export const DEFAULT_CAD_EXTENSIONS = [".stp", ".step"] as const;
export function validateCadFile(file: Pick<File, "name" | "size">, maxBytes = 50 * 1024 * 1024, allowed = DEFAULT_CAD_EXTENSIONS): string | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!allowed.includes(extension as (typeof allowed)[number])) return "Поддерживаемые форматы: STEP (.stp, .step)";
  if (file.size === 0) return "Файл пуст";
  if (file.size > maxBytes) return `Файл превышает лимит ${Math.round(maxBytes / 1024 / 1024)} МБ`;
  return null;
}
