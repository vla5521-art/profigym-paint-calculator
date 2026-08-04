# Этап 3 — удаление runtime-зависимости от базы материалов

Дата проверки: 4 августа 2026 года.

## Результат

`CalculatorPage` больше не вызывает `useDatabase`, не получает `repository` и не зависит от состояний загрузки или ошибки базы. Страница сразу открывает раздел «Калькулятор ЛКМ» и отображает `CalculatorForm`.

Из пользовательского интерфейса удалено отображение:

- `ExcelImportPanel`;
- `DemoWarning`;
- `LoadingState`;
- `ErrorState`.

Сами компоненты, `useDatabase`, JSON-база, репозитории, storage, Excel/XLSX-парсеры, типы, миграции и валидатор физически сохранены для Этапа 4.

## Изменённые файлы

Функциональный код:

- `src/pages/CalculatorPage.tsx`.

Автоматически обновлённые результаты проверок:

- `diagnostic-reports/box_10x20x30mm.json`;
- `diagnostic-reports/corrupted.json`;
- `diagnostic-reports/cube_10mm.json`;
- `diagnostic-reports/cylinder_r10_h20mm.json`;
- `diagnostic-reports/empty.json`;
- `diagnostic-reports/node-test-results.json`;
- `diagnostic-reports/open_box_shell.json`;
- `diagnostic-reports/security-results.json`;
- `diagnostic-reports/smoke-summary.json`;
- `diagnostic-reports/sphere_r10mm.json`;
- `diagnostic-reports/two_body.json`;
- `diagnostic-reports/unit-results.json`;
- `diagnostic-reports/vitest-results.json`;
- `dist/index.html` и хешированные файлы `dist/assets/` после чистой сборки.

## Новые файлы

- `tests/frontend/CalculatorPageRuntimeDatabase.test.tsx`;
- `STAGE3_RUNTIME_DB_REMOVED_REPORT.md`.

## Проверки

| Команда или сценарий | Результат |
|---|---|
| `npm install` | PASS — установлено 409 пакетов |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API 124/124, frontend 17/17 |
| `npm run test:node` | PASS — 124/124 |
| `npm run test:frontend` | PASS — 17/17 |
| `npm run test:golden` | PASS — 38/38 |
| `npm run test:regression` | PASS — 35/35 |
| `npm run test:determinism` | PASS — 5 повторов в процессе и 3 отдельных процесса, расхождений нет |
| `npm run build` | PASS — 47 модулей, Excel-шаблон проверен |
| `npm run smoke:live` без `public/data/database.json` | PASS |
| Браузер: запуск без `database.json` | PASS — запрос к файлу не выполнялся |
| Браузер: ручной расчёт `10 × 0,20 × 1,10` | PASS — `2,2 кг` |
| Браузер: STEP → площадь → ЛКМ | PASS |
| Браузер: сохранение → открытие → ЛКМ | PASS |
| `npm run security:secrets` | PASS — находок нет |
| Побайтовая проверка CAD и Docker-файлов | PASS — изменений нет |

Первый запуск `npm install` не завершился из-за попытки npm создать кэш в недоступном `/root/.npm`. Неполный `node_modules` был удалён, после чего обычная установка была успешно повторена с временным кэшем в разрешённой директории. Исходники и `package-lock.json` не изменились.

Команда `agent-browser` и Docker CLI в среде отсутствовали. Реальная ручная проверка интерфейса выполнена установленным в проекте Playwright/Chromium. Контейнерная сборка отдельно не запускалась; `Dockerfile`, `.dockerignore`, `compose.yml` и `compose.production.yml` побайтово совпадают с Этапом 2, а production-сборка приложения прошла.

Предупреждение Vite о чанке `CadViewer` размером более 500 КБ не является ошибкой и существовало вне области Этапа 3.

## Проверка без базы материалов

`public/data/database.json` был временно переименован. В этом состоянии подтверждено:

1. Страница сразу показала `CalculatorForm`.
2. Запрос к `database.json` не выполнялся.
3. Не отображались loading, error, demo warning и Excel-import UI.
4. Ручной расчёт дал ожидаемый результат `2,2 кг`.
5. STEP был загружен и обработан.
6. `paintableAreaM2` был передан в калькулятор.
7. CAD-расчёт был сохранён, открыт повторно и снова передан в калькулятор.
8. `smoke:live` обработал реальные STEP-модели.

После проверки файл возвращён на место. Его SHA-256: `331445d5d8a76edbbbcb73a74aede6d9fe1971e19443e6ea5e54f5d5d707de86`; копия в `dist/data/database.json` идентична.

## Подтверждения

- CAD-алгоритмы, STEP-импорт, контакты, отверстия, полости, overlap/deduplication, ручные решения, CAD API и сохранённые расчёты не изменялись.
- `paintableAreaM2` продолжает передаваться из нового и сохранённого CAD-расчёта.
- Формула расхода и ручной ввод нормы не изменялись.
- `public/data/database.json`, `ExcelImportPanel.tsx`, `useDatabase.ts`, `DemoWarning.tsx`, `LoadingState.tsx`, `ErrorState.tsx`, repository/storage и Excel-слой физически сохранены.
- Приложение больше не имеет runtime-зависимости от базы материалов.
- Проект готов к выполнению Этапа 4.
