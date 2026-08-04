# Этап 7 — скрытие деталей сохранённых CAD-расчётов

Дата: 2026-08-04

## Результат

Экран повторно открытого сохранённого CAD-расчёта приведён к интерфейсу Этапа 6. Сразу видны Toolbar, 3D Viewer, «Полная площадь» и «Площадь для окрашивания». Остальные площади, формула, Feature Rules, Contacts, Features, таблицы, служебные показатели и ручные действия находятся в нативном блоке `<details>` «Подробнее», закрытом по умолчанию.

Ошибки, предупреждения и счётчик `review_required` отображаются снаружи блока. Перед печатью основной и вложенные блоки `<details>` временно раскрываются, после печати их прежние состояния восстанавливаются.

## Изменённые файлы

- `src/components/cad-result/SavedCadCalculations.tsx` — только компоновка сохранённого результата и print-поведение.
- `src/styles.css` — отступ блока сохранённых деталей с повторным использованием адаптивных и печатных правил Этапа 6.
- `e2e/stage5-browser.spec.ts` — прежний тест открывает новый блок перед проверкой вложенного ручного решения.
- `e2e/stage7-saved-details-collapsed.spec.ts` — шесть сценариев Этапа 7.
- `CHANGELOG.md` — запись Этапа 7.
- `diagnostic-reports/*.json` — автоматически обновлённые результаты выполненных проверок.
- `dist/*` — актуальная production-сборка.
- `STAGE7_SAVED_RESULTS_DETAILS_COLLAPSED_REPORT.md` — этот отчёт.

## Проверки

| Команда | Результат |
|---|---|
| `npm install` | PASS — 409 пакетов |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API 115/115, frontend 25/25 |
| `npm run test:frontend` | PASS — 25/25 |
| `npm run test:node` | PASS — 115/115 |
| `npm run test:golden` | PASS — 38/38 |
| `npm run test:regression` | PASS — 35/35 |
| `npm run test:determinism` | PASS — 0 расхождений |
| `npm run build` | PASS |
| `npm run smoke:live` | PASS — STEP 600 мм², сохранение и передача 0,0006 м² |
| `npm run smoke:workflow` | PASS — 12/12 |
| `npm run e2e:chromium` | PASS — 42/42 |
| `npm run e2e:a11y` | PASS — 2/2 |
| Stage 7 Chromium | PASS — 6/6 |
| `npm run prod:local:verify` | PASS |
| `npm run security:secrets` | PASS — находок нет |

Docker CLI в среде проверки отсутствовал, поэтому `npm run prod:build` не запускался. Dockerfile и оба Compose-файла совпадают с входным архивом Этапа 6 побайтово; production build и существующая production-like проверка прошли.

## Функциональная проверка

- Toolbar и Viewer остаются видимыми при закрытом блоке.
- Две основные площади остаются видимыми при закрытом блоке.
- «Подробнее» раскрывается и сворачивается мышью, Enter и Space.
- Warning и счётчик `review_required` видны при закрытом блоке.
- Confirm, Reject, Reset и Manual Feature работают внутри раскрытого блока.
- Transfer to Paint, скачивание отчёта, переход между ревизиями, rename, duplicate и delete работают без изменения бизнес-логики.
- Проверены ширины 1440, 1024 и 390 px; горизонтального переполнения нет.
- В print media отображается полный отчёт, включая вложенную таблицу граней; экранное состояние восстанавливается после печати.

## Подтверждение границ изменений

Побайтово не изменены `src/cad`, весь `server` (CAD API, SQLite, хранение, история и алгоритмы), `package.json`, `package-lock.json`, Dockerfile и Compose-файлы. Алгоритмы STEP-импорта, контактов, отверстий, полостей, Feature Rules, определения окрашиваемой площади и ручных решений не изменялись. `revisionNumber`, URL отчётов, PaintIntegration и передача площади сохранены.

Все диагностические данные, отчёты, таблицы и ручные действия сохранены. Проект готов к выполнению Этапа 8.
