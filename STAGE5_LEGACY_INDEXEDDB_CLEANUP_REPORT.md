# Этап 5 — одноразовая очистка устаревшей IndexedDB материалов

Дата проверки: 2026-08-04.

## Результат

Добавлена изолированная одноразовая браузерная миграция. После рендера React она асинхронно удаляет только IndexedDB `profigym-user-database` и после успешного события `onsuccess` записывает маркер `profigym:migrations:material-db-cleanup:v1=completed`.

Если маркер уже содержит `completed`, `deleteDatabase` повторно не вызывается. При `onblocked`, `onerror`, отсутствии IndexedDB, недоступном `localStorage` или исключениях браузерных API приложение продолжает работать. При неуспехе маркер не записывается, поэтому следующий запуск может повторить миграцию.

## Изменённые файлы

- `src/main.tsx` — запуск cleanup после `createRoot(...).render(...)`, без ожидания перед React.
- `CHANGELOG.md` — запись об одноразовой миграции и изоляции CAD SQLite/Docker volumes.

Автоматически обновлены существующие диагностические JSON после обязательных тестов и live smoke:

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

## Новые файлы

- `src/legacy/cleanupMaterialDatabase.ts`
- `tests/frontend/cleanupMaterialDatabase.test.tsx`
- `e2e/legacy-indexeddb-cleanup.spec.ts`
- `STAGE5_LEGACY_INDEXEDDB_CLEANUP_REPORT.md`

## Область миграции

- IndexedDB: `profigym-user-database`
- Маркер: `profigym:migrations:material-db-cleanup:v1`
- Значение успешного маркера: `completed`

Модуль не вызывает `localStorage.clear()`, не удаляет другие IndexedDB, не обращается к cookies, Cache Storage, CAD API или файловой системе и не создаёт хранилище материалов.

## Автоматические проверки

| Команда / проверка | Результат |
| --- | --- |
| `npm install` | PASS — установлено 409 пакетов |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API 115/115, frontend 25/25 |
| `npm run test:frontend` | PASS — 25/25 |
| `npm run test:node` | PASS — 115/115 |
| `npm run build` | PASS |
| `npm run smoke:live` | PASS |
| `npm run test:golden` | PASS — 38/38 |
| `npm run test:regression` | PASS — 35/35 |
| `npm run test:determinism` | PASS — 0 расхождений |
| Targeted cleanup unit tests | PASS — 8/8 |
| Browser Chromium Stage 5 | PASS — 3/3 |
| Аудит `dist` | PASS — нет `database.json`, `templates` и `.xlsx` |

Первый запуск `npm install` не завершился из-за недоступного системного пути `/root/.npm`. Неполный `node_modules` был удалён, после чего та же установка успешно выполнена с разрешённым временным npm cache. Исходники и `package-lock.json` не изменились.

## Покрытые сценарии cleanup

1. Успешное удаление с точным именем базы и записью маркера.
2. Отсутствующая база — успешное завершение и маркер.
3. `onblocked` — без падения и без маркера, повтор разрешён.
4. `onerror` — без падения и без маркера.
5. Отсутствующая IndexedDB.
6. Недоступный `localStorage` и исключение записи маркера.
7. Идемпотентность после успеха.
8. Изоляция: нет удаления других баз, `localStorage.clear()` и CAD-вызовов.

## Браузерная проверка

В реальном Chromium выполнен сценарий:

1. Создана IndexedDB `profigym-user-database` с тестовой записью.
2. Удалён маркер миграции и перезагружено приложение.
3. Подтверждено отсутствие базы через `indexedDB.databases()`.
4. Подтверждён маркер `profigym:migrations:material-db-cleanup:v1=completed`.
5. После второй перезагрузки счётчик вызовов `deleteDatabase` остался равен 1.
6. Ручной расчёт `10 × 0,20 × 1,10 = 2,2 кг` прошёл.
7. Загружен `cube.step`, полная площадь — `600 мм²` (`0,0006 м²`).
8. CAD-расчёт сохранён, открыт из истории и передан в калькулятор ЛКМ.
9. Отдельно подтверждён запуск интерфейса без IndexedDB и при исключении чтения `localStorage`.

## Неизменность CAD и пользовательских данных

Побайтово совпадают с архивом Этапа 4:

- `src/cad/**`
- `server/**`, включая CAD SQLite и историю;
- `test-models/**`;
- `src/components/**`, `src/pages/**`, `src/services/**`;
- `Dockerfile`, `compose.yml`, `compose.production.yml`;
- `package.json`, `package-lock.json`.

Golden, regression и determinism не потребовали обновления эталонов. Алгоритмы STEP-импорта, контактов, отверстий, полостей, ручных решений и формула окрашиваемой площади не изменены. CAD SQLite, сохранённая история, STEP/mesh/previews/reports/backups и Docker volumes миграцией не затрагиваются.

Проект готов к Этапу 6.
