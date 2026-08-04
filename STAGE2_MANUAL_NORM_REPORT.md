# Этап 2 — ручная норма расхода ЛКМ

## Результат

Этап 2 завершён. Калькулятор ЛКМ больше не выбирает производителя и материал и не получает норму из репозитория. Пользователь вручную вводит положительную конечную норму в `кг/м²`. CAD по-прежнему передаёт `paintableAreaM2` в поле площади.

Финальный архив: `PROFiGYM_calculator_v2.0.6_STAGE2_MANUAL_NORM.zip`.

Версия приложения в `package.json` остаётся `2.0.4`, поскольку задача не требовала изменения production-версии. `v2.0.6_STAGE2_MANUAL_NORM` — идентификатор передаваемого этапа.

## Изменения производственного кода

- `src/components/CalculatorForm.tsx`
  - удалены выбор производителя и материала;
  - удалён `repository` prop и все зависимости формы от справочника;
  - добавлено обязательное поле «Норма расхода краски»;
  - поддержаны дробные значения с точкой и запятой через `parseNumberInput`;
  - единица `кг/м²` отображается справа от поля;
  - добавлены понятные сообщения для пустой, нулевой, отрицательной, бесконечной и нечисловой нормы;
  - сохранены CAD-площадь, отметка ручного переопределения, возврат к CAD, очистка и повторный расчёт.
- `src/services/calculations.ts`
  - `calculateConsumption` переведён на окончательный контракт `(area, normKgPerM2, lossFactor)`;
  - удалён публичный временный адаптер `calculateConsumptionWithManualNorm`;
  - формула не изменена: `area × normKgPerM2 × lossFactor`.
- `src/components/ResultCard.tsx`
  - удалены производитель и материал;
  - оставлены площадь, ручная норма, коэффициент, теоретический и итоговый расход;
  - единицы зафиксированы как `кг/м²` и `кг`.
- `src/pages/CalculatorPage.tsx`
  - удалена передача `repository` в `CalculatorForm`;
  - `ExcelImportPanel`, `useDatabase`, база и репозиторий сохранены;
  - пояснение формулы обновлено для ручной нормы.
- `src/styles.css`
  - добавлено расположение единицы справа внутри поля нормы.

## Изменённые тесты

- `tests/paint-consumption-baseline.test.mjs`
  - baseline переведён на окончательный числовой контракт;
  - добавлена защита единственного публичного API расчёта;
  - сценарий `10 × 0,20 × 1,10` ожидает `2,0 кг` и `2,2 кг`.
- `tests/frontend/Stage5Workflow.test.tsx`
  - текущий UI проверяется без справочника;
  - проверены точка и запятая, единицы, валидация, ручная и CAD-площадь, очистка, инвалидирование результата и повторный расчёт;
  - проверено отсутствие селекторов производителя и материала в форме и отсутствие этих полей в результате.
- `tests/import-core.test.mjs`
  - интеграционный импортный тест вызывает единственный контракт с числовым значением импортированной нормы; сам импорт и репозиторий не изменены.

## Полный список функционально изменённых файлов

1. `src/components/CalculatorForm.tsx`
2. `src/components/ResultCard.tsx`
3. `src/pages/CalculatorPage.tsx`
4. `src/services/calculations.ts`
5. `src/styles.css`
6. `tests/frontend/Stage5Workflow.test.tsx`
7. `tests/import-core.test.mjs`
8. `tests/paint-consumption-baseline.test.mjs`

## Новые файлы

- `STAGE2_MANUAL_NORM_REPORT.md`

## Автоматически обновлённые результаты проверок

- `diagnostic-reports/box_10x20x30mm.json`
- `diagnostic-reports/corrupted.json`
- `diagnostic-reports/cube_10mm.json`
- `diagnostic-reports/cylinder_r10_h20mm.json`
- `diagnostic-reports/empty.json`
- `diagnostic-reports/node-test-results.json`
- `diagnostic-reports/open_box_shell.json`
- `diagnostic-reports/smoke-summary.json`
- `diagnostic-reports/sphere_r10mm.json`
- `diagnostic-reports/two_body.json`
- `diagnostic-reports/unit-results.json`
- `diagnostic-reports/vitest-results.json`
- чистый `dist` после новой успешной сборки.

`dist` включён в архив, потому что он присутствовал во входном релизном пакете и проект содержит обязательную postbuild-проверку production-копии Excel-шаблона.

## Проверки

| Команда или сценарий | Результат |
|---|---|
| `npm install` | PASS после повторного запуска с временным кэшем; установлено 409 пакетов |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API 124/124, frontend 15/15 |
| `npm run test:node` | PASS — 124/124 |
| `npm run test:frontend` | PASS — 15/15 |
| `npm run test:golden` | PASS — 38/38 |
| `npm run test:regression` | PASS — 35 snapshots |
| `npm run test:determinism` | PASS — 5 повторов в процессе, 3 отдельных процесса, 0 расхождений |
| `npm run build` | PASS |
| `npm run smoke:live` | PASS |
| Ручной Chromium: `10 / 0,20 / 1,10` | PASS — теоретический `2 кг`, итоговый `2,2 кг` |
| Ручной Chromium: повторный расчёт и очистка | PASS |
| Focused E2E CAD → калькулятор | PASS — 1/1 |
| Сравнение запрещённых областей с исходным ZIP | PASS — различий нет |
| `npm run security:secrets` из распакованного ZIP | PASS — находок нет |
| Распакованный ZIP: `npm install` | PASS — 409 пакетов |
| Распакованный ZIP: lint, typecheck и целевые тесты | PASS |
| Распакованный ZIP: build и `smoke:live` | PASS |
| Excel-шаблон в `public` и `dist` | PASS — SHA-256 `0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8` |

Первый `npm install` не завершился, потому что npm попытался создать кэш в недоступном `/root/.npm`. Неполный `node_modules` был перемещён во временную директорию, установка повторена с кэшем в `/tmp` и прошла успешно. Lock-файл не изменился.

Первый целевой frontend-прогон обнаружил только неоднозначный assertion: текст `1,1` одновременно соответствовал коэффициенту и итоговому значению. Assertion уточнён до `1,1 кг`; производственный код не менялся по этой причине, повторный прогон прошёл.

## Ручная проверка

Для площади `10 м²`, нормы `0,20 кг/м²` и коэффициента `1,10` подтверждено:

- теоретический расход: `2,0 кг` (в UI форматируется как `2 кг`);
- итоговый расход: `2,2 кг`.

Дополнительно подтверждены дробная норма с запятой, ручная площадь, CAD-площадь, отсутствие селекторов справочника в форме, отображение `кг/м²` справа, повторный расчёт и очистка.

## Неизменность запрещённых областей

Побайтовое сравнение с исходным ZIP не выявило различий в:

- `src/cad`, CAD-компонентах, STEP-импорте и алгоритмах площади;
- контактах, отверстиях, полостях, ручных решениях и сохранённых расчётах;
- `server`, CAD API, авторизации и production security;
- `Dockerfile`, `compose.yml`, `compose.production.yml`;
- `public/data/database.json`;
- `ExcelImportPanel`, Excel-parser, XLSX, шаблоне Excel;
- `useDatabase`, репозиториях и storage;
- `package.json` и `package-lock.json`.

## Контракт и готовность

В производственном API остался один публичный способ расчёта: `calculateConsumption(area, normKgPerM2, lossFactor)`. Временный контракт Этапа 1 удалён. Проект полностью работоспособен и готов к Этапу 3.
