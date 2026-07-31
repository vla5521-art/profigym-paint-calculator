# STAGE5_REPORT — PROFiGYM 1.8.1

Дата проверки: 2026-07-31. Итоговая папка: `PROFiGYM_calculator_v1.8.1_STAGE5_BROWSER_E2E`.

## Результат

Этап 5 реализован непосредственно поверх проекта 1.7.0. Архитектура остаётся STEP-only: принимаются только `.stp` и `.step`; `.sldprt`, `.sldasm`, `.asm` и посторонние форматы не имеют импортёров и отклоняются HTTP 415.

Пользовательский поток:

```text
STEP → OCCT B-Rep → contacts/features → viewer mesh → проверка решений
→ SQLite-сохранение → повторное открытие/ревизия → JSON/HTML-отчёт
→ подтверждённая передача paintableAreaM2 в калькулятор ЛКМ
```

## Фактическая архитектура

- `server/cad/viewer/` — серверная OCCT-триангуляция, категории, отдельные B-Rep patches частичных контактов, лимит и cache-параметры mesh.
- `server/cad/calculations/` — SQLite repository, миграции, CRUD, ревизии, журнал решений, перерасчёт, восстановление совместимых ID и проверка канонических инвариантов.
- `server/cad/reports/` — JSON Schema, JSON-отчёт, печатный standalone HTML и проверяемый PNG/JPEG preview.
- `server/cad/integration/` — единственная передача окрашиваемой площади в существующий калькулятор ЛКМ.
- `src/components/cad-viewer/` — Three.js Viewer, OrbitControls, выбор граней, камеры, легенда, WebGL fallback и снимок для отчёта.
- `src/components/cad-result/` — список и повторное открытие сохранённых расчётов, решения, правила, ручные исключения и повторный расчёт.

Алгоритмы определения площади, контактов и features этапов 2–4 не заменялись. Изменения в их кодовом пути ограничены добавлением viewer mesh к результату и повторным использованием уже вычисленного канонического состояния.

## 3D Viewer

Используется Three.js `0.185.1`, `WebGLRenderer` и `OrbitControls`. Компонент загружается через `React.lazy`: основной production chunk равен 285,83 КБ, отдельный Viewer chunk — 540,40 КБ.

`occt-wasm meshShape()` формирует индексированные `positions`, `normals` и `indices`. Группа mesh сопоставляется с исходным hash B-Rep-грани и получает тот же стабильный `faceId`, который используется API, contact/feature services и таблицами. Для каждой грани передаются `bodyId`, bounding box, surface type, площадь, категория, статус и source IDs. Исходный STEP/B-Rep в браузер не передаётся.

Частичный контакт визуализируется отдельной patch-сеткой из точной области `BRepAlgoAPI_Common`; исходная грань не помечается целиком. Поддержаны вращение, масштабирование, pan, автоматическое вписывание, изометрия/спереди/сверху/справа, сброс, оси, перспектива/ортографическая камера, hover, click selection, resize и WebGL fallback.

Параметры по умолчанию:

| Параметр | Значение |
|---|---:|
| `CAD_VIEWER_LINEAR_DEFLECTION_MM` | 0,15 мм |
| `CAD_VIEWER_ANGULAR_DEFLECTION_DEG` | 20° |
| `CAD_VIEWER_MAX_TRIANGLES` | 750 000 |
| `CAD_VIEWER_MESH_CACHE_TTL_MS` | 300 000 мс |

При превышении лимита mesh огрубляется до трёх раз, затем возвращается управляемое `VIEWER_MESH_TOO_LARGE` без потери площадей и табличного workflow.

## Экран проверки

Результат показывает все категории площадей в мм², см² и м² и формулу `paintable = total − unique confirmed excluded`. Реализованы вкладки, поиск по face/body/feature/contact ID, фильтры типа и статуса, сортировка по площади, выбор строк, массовые confirm/reject/reset с подтверждением, ручное исключение, правила features и двустороннее выделение через общий face ID.

После сохранения снова доступны Viewer, контакты, features, ручные исключения, правила, решения, отчёты и перерасчёт. Изменения немедленно обновляют каноническую сводку и перекрашивают сохранённую mesh.

## Persistence и ревизии

Используется встроенная SQLite `node:sqlite`, schema version `1`; внешняя БД не требуется. Таблицы:

- `calculations` — метаданные и полный канонический JSON состояния;
- `revisions` — номер, причина, settings, summary, algorithm version и parent revision;
- `decision_history` — действие, тип/ID сущности, предыдущий/новый статус и время;
- `schema_migrations` — применённые миграции.

STEP, viewer mesh и preview лежат вне `public` под случайным `calculationId`. Все storage references запрещают absolute path/`..` и обязаны принадлежать собственному calculation ID. Дубликат физически копирует source, mesh и preview. Удаление очищает каталог; повторное удаление возвращает `CALCULATION_NOT_FOUND`.

Retention управляется `CAD_SOURCE_FILE_RETENTION_ENABLED` и `CAD_SOURCE_FILE_RETENTION_DAYS` (по умолчанию 30 суток). После удаления source исторический результат, mesh и отчёты остаются, но новый B-Rep-перерасчёт невозможен.

Повторный расчёт использует сохранённый STEP, создаёт новую ревизию и восстанавливает ручные решения только при совпадении стабильных IDs. Несовпавшие решения возвращаются как `DECISION_RESTORE_CONFLICT` и не применяются молча.

## API

Добавлены CRUD `/api/cad/calculations`, list pagination/search/status/sort, duplicate, recalculate, revisions, viewer mesh, bulk decisions, manual features, report JSON/HTML, report schema, preview upload/read и `integrate-paint`. Старые API заданий, контактов, features и правил сохранены.

## Отчёты и preview

`report.json` соответствует `report-schema/cad-report-1.0.0.schema.json` и не содержит абсолютных путей, STEP, B-Rep, stack traces или mesh. Числа берутся из того же backend summary, что экран и ЛКМ.

Человекочитаемый формат — автономный печатный HTML с возможностью браузерной печати в PDF. Backend PDF намеренно не добавлен. Отчёт содержит идентификатор, SHA-256, версии, формулу, площади, contacts, features, manual exclusions, статусы, правила и предупреждения.

Viewer создаёт PNG preview. Backend принимает только multipart PNG/JPEG, проверяет magic bytes, размер (2 МиБ), разрешение (4096×4096) и владение расчётом. При отсутствии preview отчёт успешно формируется с заглушкой.

## Интеграция с ЛКМ

Передача требует завершённого расчёта, положительной площади, соблюдённых инвариантов и явного подтверждения. Передаются числовые `paintableAreaMm2`, `paintableAreaM2`, calculation ID, имя STEP, дата и algorithm version. При `review_required` показывается предупреждение, но неподтверждённая область не вычитается.

Калькулятор показывает источник CAD, файл, ID и дату. Ручное изменение площади явно помечается и не скрывает исходное CAD-значение.

## Канонические инварианты

Перед отчётом и интеграцией проверяются с допуском:

```text
paintableAreaMm2 = totalAreaMm2 - uniqueConfirmedExcludedAreaMm2
rawExcludedAreaMm2 - overlapAreaMm2 = uniqueConfirmedExcludedAreaMm2
```

Контакты, features, ручные исключения, экран, JSON, HTML и ЛКМ не рассчитывают итог независимо.

## Уровни автоматической проверки

Термины разделены строго:

- **Node integration/unit:** 95 тестов API, SQLite, OCCT/B-Rep и расчётных алгоритмов. `stage5-workflow.integration.mjs` относится только к этой группе и не называется browser E2E.
- **jsdom frontend:** 12 Vitest-тестов компонентов и состояния без настоящего браузерного WebGL.
- **Playwright browser E2E:** 17 тестовых запусков в настоящем Chromium 149 через Playwright 1.62.1: 12 функциональных сценариев, 3 viewport-сценария и 2 accessibility-сценария.
- **Ручная визуальная проверка:** не заменяет автоматические E2E и в итоговые числа не включена.

Browser E2E используют настоящий backend, отдельную SQLite и каталоги upload/storage/report/mesh-cache, реальный OCCT, Three.js и STEP-файлы `through_hole.step`, `stepped_hole.step`, `open_internal_cavity.step`, `no_features.step`, `two_plates_partial_overlap.step`. Основные CAD API не мокируются. Подтверждены WebGL context, ненулевые faces/triangles, реальный raycast canvas→faceId, таблица→material selection, multi-face feature, отдельный contact patch, manual exclusion, persistence после второго backend-процесса, HTML report с/без preview, CAD→ЛКМ, review warning и fallback с отключённым WebGL.

Проверены viewport 1440×900, 1024×768 и 768×1024; эталонные screenshots находятся в `artifacts/e2e/`. Browser fixture завершает тест ошибкой при console error, page error, failed обязательном API request и HTTP 500. Axe не выявил critical accessibility violations; клавиатурой проверены focus-visible, Enter/Space для строк и действий, отмена диалога и возврат фокуса.

Остальные проверки:

- 12 из 12 сценариев Node `smoke:workflow`, включая persistence restart, CRUD/search/pagination, revision, preview, retention, XSS/path traversal, отчёты и CAD→ЛКМ;
- 9 contact smoke-моделей;
- 6 feature smoke-сценариев;
- live smoke поднял frontend и backend, обработал 5 валидных моделей, 3 диагностических ошибки и подтвердил HTTP 415 для `.sldprt`, `.sldasm` и постороннего формата.

Использованы 32 STEP/STP-файла, включая 12 feature fixtures этапа 4. Проверки Stage 2 area, Stage 3 contacts и Stage 4 features вошли в общий прогон и прошли.

## Фактические benchmark-результаты чистого прогона

Viewer:

| Сценарий | STEP processing | Mesh | Треугольники | Payload |
|---|---:|---:|---:|---:|
| through hole | 247,142 мс | 13,994 мс | 160 | 11 814 Б |
| multiple features | 60,811 мс | 6,187 мс | 316 | 24 327 Б |
| multi-body | 30,771 мс | 1,740 мс | 24 | 4 626 Б |
| contact + feature | 94,403 мс | 5,143 мс | 300 | 28 749 Б |
| 10-body chain | 422,771 мс | 10,562 мс | 120 | 27 036 Б |
| крупная sphere mesh | 1 034,122 мс | 1 026,534 мс | 66 280 | 4 966 174 Б |

Viewer heap: 8 939 488 → 27 518 176 Б.

Persistence (`multiple_features.step`): STEP 300,647 мс; DB save 6,849 мс; DB+mesh load 0,807 мс; JSON report 0,434 мс; полный workflow 318,285 мс; heap 8 563 648 → 12 601 600 Б.

Contacts: полный измеренный цикл 93,402–350,729 мс; broad phase сократил 45 потенциальных пар до 0 для разнесённых тел и до 9 для цепочки контактов.

Features: processing 1,352–10,704 мс для шести smoke-сценариев; первый STEP дополнительно включает инициализацию WASM.

## Чистый прогон и шаблон

`node_modules`, `dist`, `playwright-report` и `test-results` были перемещены из проекта во временный каталог. Первая online-установка выявила повреждённые tarball-ответы registry и не была засчитана. Проверенный локальный cache (`875` объектов, 581 442 501 Б) позволил `npm install --offline` заново установить 407 пакетов. Затем на отдельной SQLite последовательно прошли:

```text
db:migrate, lint, typecheck, test, build, verify:template,
smoke/benchmark:contacts, smoke/benchmark:features,
smoke:workflow, e2e:chromium (17/17), e2e:a11y (2/2),
benchmark:viewer, benchmark:persistence, smoke:live
```

Unicode-шаблон существует в `public/templates/PROFiGYM_шаблон_импорта.xlsx` и `dist/templates/PROFiGYM_шаблон_импорта.xlsx`, открывается как XLSX и имеет одинаковый SHA-256:

```text
0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8
```

## Регрессии этапов 1–4

Регрессий расчётных алгоритмов не выявлено. Все прежние area/contact/feature/API/frontend/Excel проверки прошли. STEP-only граница и предотвращение двойного вычитания сохранены.

## Ограничения и production-readiness

- Chromium E2E подтверждает настоящий WebGL/SwiftShader и реальные screenshots. Pixel-perfect golden diff намеренно не используется.
- Firefox и WebKit в этой среде не устанавливались: их CDN недоступен, поэтому они не заявлены как пройденные. Обязательный Chromium пройден.
- Официальный `npx playwright install chromium` в контейнере блокируется сертификатной политикой CDN. Для воспроизводимого Chromium-прогона используется настоящий Chromium 149 + SwiftShader из `@sparticuz/chromium`; это ограничение способа поставки бинарника, а не mock браузера.
- `node:sqlite` в Node 24 всё ещё выводит experimental warning. Для многопользовательской/кластерной эксплуатации нужна отдельная оценка транзакций, backup и locking.
- Создаётся печатный HTML, а не backend PDF.
- 3D chunk Three.js — 540,40 КБ; он ленивый и не блокирует основной калькулятор, но крупные модели требуют дальнейшего streaming/compression/LOD.
- Standalone MVP не содержит аутентификации и разграничения пользователей.
- После истечения retention исходного STEP повторный геометрический расчёт невозможен; исторический результат остаётся доступным.
- Резьбы, произвольные NURBS-каналы и доступность конкретного окрасочного оборудования остаются ограничениями алгоритма этапа 4.
