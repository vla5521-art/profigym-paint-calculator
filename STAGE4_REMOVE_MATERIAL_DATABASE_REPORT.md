# Этап 4 — удаление клиентского справочника материалов

Исходный архив: `PROFiGYM_calculator_v2.0.7_STAGE3_RUNTIME_DB_REMOVED(1).zip`  
SHA-256 исходного архива: `92a49b2f63d4beb746c8876453c71e67eeede7358fff4f8b26d76d378a3c10ca`

## Результат

Клиентский справочник материалов и весь неиспользуемый связанный слой физически удалены. Калькулятор ЛКМ продолжает работать по ручной норме расхода. CAD, STEP, Contacts, Holes, Cavities, Feature Rules, Manual Decisions, Paint Integration, SQLite, server API, авторизация, история и Docker Compose сохранены.

В production build отсутствуют `dist/data/database.json` и `dist/templates`.

## Удалённые файлы

- `public/data/database.json`
- `public/templates/PROFiGYM_шаблон_импорта.xlsx`
- `scripts/verify-template-packaging.mjs`
- `src/components/DemoWarning.tsx`
- `src/components/ErrorState.tsx`
- `src/components/ExcelImportPanel.tsx`
- `src/components/LoadingState.tsx`
- `src/config/database.ts`
- `src/hooks/useDatabase.ts`
- `src/import/DatabaseImportTransformer.ts`
- `src/import/IdFactory.ts`
- `src/import/normalization.ts`
- `src/repository/DatabaseRepository.ts`
- `src/repository/JsonRepository.ts`
- `src/repository/PersistentDatabaseRepository.ts`
- `src/repository/WritableDatabaseRepository.ts`
- `src/services/ExcelImportService.ts`
- `src/services/excelImportParser.ts`
- `src/services/xlsxZipReader.ts`
- `src/storage/DatabaseStore.ts`
- `src/storage/IndexedDbDatabaseStore.ts`
- `src/storage/MemoryDatabaseStore.ts`
- `src/types/database.ts`
- `src/types/import.ts`
- `src/utils/logger.ts`
- `src/utils/migration.ts`
- `src/utils/validator.ts`
- `tests/frontend/CalculatorPageRuntimeDatabase.test.tsx`
- `tests/import-core.test.mjs`
- `tests/migration.test.mjs`
- `tests/xlsx-archive.test.mjs`

После удаления файлов удалены ставшие пустыми каталоги `public/data`, `public/templates`, `src/config`, `src/hooks`, `src/import`, `src/repository` и `src/storage`.

## Изменённые файлы

- `.env.example` — удалена переменная URL клиентской базы.
- `.github/workflows/container.yml` — удалён template-only CI-шаг.
- `.github/workflows/quality.yml` — build больше не вызывает удалённый verifier.
- `CI.md`, `README.md`, `PRODUCTION_CHECKLIST.md` — удалены актуальные инструкции и проверки Excel-шаблона.
- `Dockerfile` — удалено копирование удалённого template-verifier; остальные стадии не менялись.
- `package.json` — удалены `postbuild`, `test:migration`, `test:xlsx`, `verify:template`.
- `scripts/generate-test-report.mjs` — удалён template-only статус.
- `scripts/run-live-smoke.mjs` — удалена проверка Excel-шаблона.
- `scripts/smoke-test.mjs` — добавлена явная проверка сохранения и передачи CAD-площади в ЛКМ с очисткой smoke-записи.
- `src/styles.css` — удалены неиспользуемые стили Excel-панели; CAD-стили сохранены.
- `src/types/vite-env.d.ts` — удалён тип переменной URL клиентской базы.
- `tsconfig.app.tsbuildinfo` — автоматически обновлён production build после удаления исходников.

Новый regression-тест: `tests/frontend/CalculatorPageStartup.test.tsx`.

`package-lock.json`, `compose.yml` и `compose.production.yml` побайтово не изменены.

## Проверки

| Команда / проверка | Результат |
|---|---|
| `npm install` | PASS — 409 пакетов |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API 115/115, frontend 17/17 |
| `npm run test:node` | PASS — 115/115 |
| `npm run test:frontend` | PASS — 17/17 |
| `npm run test:golden` | PASS — 38/38, отклонения 0 |
| `npm run test:regression` | PASS — 35/35 |
| `npm run test:determinism` | PASS — расхождений нет |
| `npm run build` | PASS |
| `npm run smoke:live` | PASS — frontend/backend, STEP, площадь, сохранение, CAD→ЛКМ |
| Browser UI | PASS — ручной расчёт и STEP→ЛКМ, console errors 0 |
| `npm run prod:local:verify` | PASS — 39/39 + отдельные API/worker процессы |
| Observability внутри production-like | PASS — 24/24 |
| `npm run ci:actionlint` | PASS — 3 workflow |
| Аудит `dist` | PASS — базы и templates нет |
| Аудит runtime-зависимости `xlsx` | PASS — `(empty)` |
| Аудит операционных ссылок | PASS — совпадений нет |
| Проверка защищённых CAD/history-файлов | PASS — 160/160 побайтово совпадают |

Удаление 9 Node-тестов material/Excel/migration-слоя ожидаемо уменьшило счётчик с 124 до 115. Все оставшиеся CAD/API/history/security-тесты прошли.

## Ручные сценарии

- Приложение запускается и сразу показывает калькулятор ЛКМ.
- Ручной расчёт: `10 м² × 0,20 кг/м² × 1,10 = 2,2 кг` — PASS.
- `cube_10mm.stp` загружен и обработан — PASS.
- Площадь `600 мм²` рассчитана — PASS.
- Площадь `0,0006 м²` передана в калькулятор с источником `cad_calculation` — PASS.
- Сохранение и повторное открытие CAD-расчёта — PASS в Node/API и production-like проверках.
- Расчёт по ручной норме после передачи CAD-площади — PASS.

## Неизменность CAD и истории

Побайтовое сравнение 160 защищённых файлов подтвердило отсутствие изменений в `src/cad`, `CadUploadPanel`, CAD viewer/result components, `server`, STEP-моделях и golden/regression-наборах. Golden `38/38`, regression `35/35` и determinism без расхождений подтверждают прежние площади и правила исключений.

Серверный SQLite/history-слой не изменён. Тесты сохранения, поиска, повторного открытия, revisions, backup/restore и CAD→ЛКМ прошли.

## Docker

`compose.yml` и `compose.production.yml` побайтово не изменены. Dockerfile сохраняет прежние build/dependencies/runtime стадии; единственное изменение — удаление `COPY` уже удалённого template-verifier. Обычный production build и production-like runtime прошли. В среде отсутствуют Docker/Podman/Buildah/nerdctl, поэтому фактическая container build-команда здесь не запускалась.

## Готовность

Клиентская база материалов, Excel-импорт, JSON-справочник, client repository, Browser Storage, типы, migration/validator, import tests и связанные build/runtime-зависимости отсутствуют. Проект готов к Этапу 5.
