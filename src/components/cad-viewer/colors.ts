import type { ViewerCategory } from "../../cad/api.ts";

export const VIEWER_CATEGORIES: Record<ViewerCategory, { color: number; label: string; opacity: number; pattern: string }> = {
  painted: { color: 0x8da2b5, label: "Окрашиваемая поверхность", opacity: 1, pattern: "сплошная" },
  contact_excluded: { color: 0xe74c3c, label: "Исключено: контакт", opacity: 0.92, pattern: "контактный patch" },
  hole_excluded: { color: 0x3498db, label: "Исключено: отверстие", opacity: 0.96, pattern: "контур" },
  cavity_excluded: { color: 0x9b59b6, label: "Исключено: полость", opacity: 0.94, pattern: "полупрозрачная" },
  manual_excluded: { color: 0xff7a12, label: "Ручное исключение", opacity: 0.96, pattern: "контур" },
  review_required: { color: 0xf1c40f, label: "Требует проверки", opacity: 0.72, pattern: "полупрозрачная" },
  rejected: { color: 0x65727e, label: "Отклонено", opacity: 0.55, pattern: "полупрозрачная" },
  selected: { color: 0xffffff, label: "Выбрано", opacity: 1, pattern: "яркий контур" },
};

