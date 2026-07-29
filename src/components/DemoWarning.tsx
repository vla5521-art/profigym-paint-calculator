import type { Metadata } from "../types/database.ts";

interface DemoWarningProps { metadata: Metadata; }

export function DemoWarning({ metadata }: DemoWarningProps): React.JSX.Element | null {
  if (metadata.dataset_type !== "demo" && metadata.is_demo !== true) return null;
  return (
    <aside className="demo-warning" role="note">
      <strong>Демонстрационная версия</strong>
      <span>{metadata.calculation_warning ?? "В расчётах используются тестовые нормы расхода. Результаты нельзя применять для производственных работ."}</span>
    </aside>
  );
}
