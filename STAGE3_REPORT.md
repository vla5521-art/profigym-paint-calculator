# Отчёт этапа 3 — контактные исключения

Дата проверки: **2026-07-31**  
Версия: **1.6.0**  
Корневая папка: `PROFiGYM_calculator_v1.6.0_STAGE3_CONTACTS`  
Границы MVP: только STEP `.stp` и `.step`

## Итог

В существующий проект этапа 2 добавлен отдельный модуль определения сопрягающихся и контактных поверхностей. Полная, частичная плоская и цилиндрическая контактные области вычисляются точными B-Rep-операциями OCCT. Касания по линии/точке имеют нулевое исключение. Малый положительный зазор получает `review_required` и не вычитается без решения пользователя.

Формула:

```text
paintableAreaMm2 =
totalAreaMm2 - confirmedExcludedPaintAreaMm2
```

Обе стороны подтвержденной области не окрашиваются. Для одиночного контакта площади `A` исключение равно `2 × A`. Перед суммированием области объединяются по граням через OCCT, поэтому перекрывающиеся зоны одной грани не вычитаются повторно.

## Архитектура

```text
STEP importer
  → normalized B-Rep model
  → AABB sweep-and-prune broad phase
  → distanceBetween + BRepAlgoAPI_Common narrow phase
  → contact classification
  → B-Rep union / exclusions
  → paintable area
```

Ответственность разделена:

- `server/cad/contacts/config.js` — централизованные допуски;
- `broad-phase.js` — канонические AABB-пары тел и граней;
- `narrow-phase.js` — точные OCCT-проверки и BREP контактных областей;
- `classifier.js` — тип, уверенность, статус и причина;
- `service.js` — связывание нормализованной модели, дедупликация, объединение площадей и API-представление.

## B-Rep-операции

- `BRepBndLib::AddOptimal` через `getBoundingBox` — точные AABB.
- `BRepExtrema_DistanceSS` через `distanceBetween` — минимальное расстояние граней.
- `BRepAlgoAPI_Common` через `common` — фактическая область совпадения граней.
- `BRepAlgoAPI_Fuse` через `fuseAll` — объединение перекрывающихся исключаемых областей.
- `BRepGProp::SurfaceProperties` через `getSurfaceArea` — площадь B-Rep-области.
- `Geom_Surface`/UV API — тип и нормаль поверхности.

Bounding box не используется как доказательство контакта.

## Типы и статусы

Реализованы:

- `full_planar_contact`;
- `partial_planar_contact`;
- `cylindrical_contact`;
- `tangent_contact`;
- `near_gap`;
- `ambiguous_contact`.

Статусы:

- `confirmed` — точная ненулевая область и уверенность не ниже порога;
- `review_required` — малый зазор с потенциальной плоской областью, угловая/типовая неоднозначность или уверенность ниже порога;
- `rejected` — нулевая площадь касания либо отсутствие фактического контакта.

`near_gap` никогда не подтверждается автоматически.

## Допуски

| Переменная | По умолчанию | Обоснование |
|---|---:|---|
| `CAD_CONTACT_DISTANCE_TOLERANCE_MM` | 0,05 мм | Малый производственный/экспортный зазор; применяется только к кандидатам |
| `CAD_CONTACT_ANGLE_TOLERANCE_DEG` | 1° | Допустимое численное отклонение параллельных/соосных поверхностей |
| `CAD_CONTACT_AREA_TOLERANCE_MM2` | 0,01 мм² | Отсечение численного шума OCCT и контроль переполнения |
| `CAD_CONTACT_REVIEW_THRESHOLD` | 0,9 | Автоподтверждение только уверенных точных случаев |

Расчёт хранит числа двойной точности. Округление до девяти знаков выполняется только при формировании публичного JSON.

## Результаты реальных STEP-фикстур

Фикстуры воспроизводимо создаёт `scripts/generate-contact-fixtures.mjs`. Эталоны находятся в `test-models/contacts/expected.json`.

| Модель | Классификация | Физическая площадь, мм² | Исключено, мм² | Окрашивается, мм² |
|---|---|---:|---:|---:|
| `two_plates_full_contact.step` | full planar | 200 | 400 | 640 |
| `two_plates_partial_overlap.step` | partial planar | 100 | 200 | 840 |
| `cylindrical_fit.step` | cylindrical | 1256,637061436 | 2513,274122872 | 2412,743157957 |
| `tangent_contact.step` | tangent point | 0 | 0 | 2513,274122872 |
| `tangent_line_contact.step` | tangent line | 0 | 0 | 6684,955592154 |
| `small_gap_below_tolerance.step` | near gap / review | 0 | 0 | 1040 |
| `gap_above_tolerance.step` | no contact | 0 | 0 | 1040 |
| `multiple_contacts.step` | 2 full planar | 400 | 800 | 760 |
| `multi_body_no_contact.step` | no contact | 0 | 0 | 6000 |
| `ten_plates_chain_contacts.step` | 9 full planar | 1800 | 3600 | 1600 |

Для малого зазора потенциальная проверяемая область равна 200 мм², но подтвержденная физическая и исключенная площади равны нулю.

Дополнительный тест с двумя перекрывающимися частичными областями по 100 мм² на одной грани подтвердил точное объединение: вместо ошибочных 400 мм² исключено 350 мм².

## Broad phase и детерминизм

- Самосравнение тел исключено.
- Пары канонизируются по устойчивым ID.
- Body/face-пары не дублируются.
- Результат не зависит от порядка входного массива.
- `contactId` — SHA-256 от канонической пары face ID, типа и геометрического отпечатка области.
- Повторная обработка неизмененного STEP возвращает те же уникальные contact ID и те же геометрические результаты.

На `multi_body_no_contact.step`: 10 тел, 45 потенциальных пар, 0 пар после broad phase, 0 точных проверок.

## API ручных решений

Добавлены:

```text
GET  /api/cad/report/{jobId}/contacts
POST /api/cad/report/{jobId}/contacts/{contactId}/confirm
POST /api/cad/report/{jobId}/contacts/{contactId}/reject
POST /api/cad/report/{jobId}/contacts/{contactId}/reset
```

Решение сохраняется на время жизни задания. Каждая операция повторно объединяет активные B-Rep-области, немедленно меняет сводку и не требует повторной загрузки STEP.

Проверены коды:

- `CONTACT_NOT_FOUND`;
- `INVALID_CONTACT_DECISION`;
- `CONTACT_GEOMETRY_FAILED`;
- `CONTACT_AREA_OVERFLOW`;
- `JOB_NOT_COMPLETED`.

## Frontend

Сохранены загрузка STEP, статус, диагностика и таблица граней. Добавлены:

- «Полная площадь»;
- «Исключено по контактам»;
- «Требует проверки»;
- «Окрашиваемая площадь»;
- таблица контактов с типом, телами, гранями, физической/потенциальной/исключаемой площадью, уверенностью, статусом, причиной и допуском;
- действия «Подтвердить исключение», «Отклонить», «Сбросить решение».

3D-визуализация не добавлялась.

## Фактическая производительность

Команда: `npm run benchmark:contacts`. Runtime: Node.js v24.14.0. Полный JSON: `diagnostic-reports/contacts-benchmark.json`.

| Сценарий | STEP import, мс | Broad, мс | Narrow, мс | Classification, мс | Exact checks | Измеренный полный цикл, мс |
|---|---:|---:|---:|---:|---:|---:|
| 2 тела / 1 контакт | 205,865 | 5,458 | 74,970 | 0,297 | 21 | 314,252 |
| 3 тела / несколько контактов | 16,094 | 0,094 | 73,934 | 0,152 | 42 | 107,875 |
| 10 тел / без контакта | 50,040 | 0,075 | 0,003 | 0,010 | 0 | 100,061 |
| 10 тел / цепочка контактов | 50,791 | 0,088 | 227,588 | 1,291 | 189 | 330,982 |

Первый сценарий включает холодную инициализацию WASM и первое BREP-объединение. RSS измерен только до/после сценариев, а не как истинный peak: первый наблюдаемый прирост 366 583 808 байт, последующие 1,8–10,5 МБ. Искусственный порог производительности не применялся.

## Проверки

Финальный прогон после всех изменений:

| Команда | Результат |
|---|---|
| `npm install` | успешно, установлено 378 пакетов |
| `npm run lint` | успешно, 0 ошибок |
| `npm run typecheck` | успешно, 0 ошибок |
| `npm test` | успешно: 54 Node/unit/integration/API + 5 frontend = 59 |
| `npm run build` | успешно, Vite production build и postbuild-проверка шаблона |
| `npm run verify:template` | успешно, исходник и production-копия XLSX идентичны |
| `npm run smoke:contacts` | успешно, 9 эталонных contact-сценариев |
| `npm run benchmark:contacts` | успешно, 4 сценария |
| `npm run smoke:live` | успешно, frontend/API/STEP/Excel-шаблон |

Stage 2 не сломан: аналитические куб, параллелепипед, цилиндр и сфера проходят; поврежденный/пустой STEP, открытая оболочка и многотельная модель сохраняют диагностику; `.sldprt`, `.sldasm`, `.txt` отклоняются HTTP 415.

Доступность Excel-шаблона подтверждается автоматическим тестом `tests/xlsx-archive.test.mjs` и обязательной postbuild-проверкой `npm run verify:template`. Проверки требуют единственный файл с точным UTF-8 именем `public/templates/PROFiGYM_шаблон_импорта.xlsx`, запрещают `PROFiGYM_#U*.xlsx`, открывают исходник и production-копию как XLSX и сравнивают их SHA-256. Таким образом утверждение о наличии `dist/templates/PROFiGYM_шаблон_импорта.xlsx` основано на результате production build, а не на файле, оставшемся до упаковки.

## Исправление упаковки Excel-шаблона

- Канонический исходный путь: `public/templates/PROFiGYM_шаблон_импорта.xlsx`.
- Канонический production-путь: `dist/templates/PROFiGYM_шаблон_импорта.xlsx`.
- В приложенном ZIP текущей сессии обе записи уже декодировались как Unicode; файла с буквальным именем `PROFiGYM_#U*.xlsx` после распаковки не обнаружено.
- Финальный ZIP формируется в локали UTF-8 и содержит для кириллических ZIP-записей флаг UTF-8.
- Повреждённые дубли `PROFiGYM_#U*.xlsx` отсутствуют в `public`, `dist`, проекте и финальном архиве.
- SHA-256 исходника: `0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8`.
- SHA-256 production-копии: `0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8`.
- Размер обеих копий: 62 254 байта.
- Финальный архив `PROFiGYM_calculator_v1.6.0_STAGE3_CONTACTS_TEMPLATE_FIXED.zip` повторно распакован в отдельный временный каталог; оба канонических пути, отсутствие `#U`-дублей, корректность XLSX и совпадение SHA-256 подтверждены на содержимом распакованного ZIP.

## Созданные файлы

- `API.md`
- `CONTACT_ALGORITHM.md`
- `STAGE3_REPORT.md`
- `server/cad/contacts/{config,broad-phase,narrow-phase,classifier,service}.js`
- `scripts/generate-contact-fixtures.mjs`
- `scripts/smoke-contacts.mjs`
- `scripts/benchmark-contacts.mjs`
- `scripts/verify-template-packaging.mjs`
- `test-models/contacts/*.step`
- `test-models/contacts/expected.json`
- `tests/contact-broad-phase.test.mjs`
- `tests/contact-classifier.test.mjs`
- `tests/cad-contacts.integration.mjs`
- `tests/cad-contacts-api.integration.mjs`
- `diagnostic-reports/contacts-benchmark.json`

## Основные изменённые файлы

- `package.json`, `package-lock.json`, `.env.example`
- `server/config.js`, `server/app.js`, `server/jobs.js`
- `server/cad/kernel.js`, `server/cad/processor.js`, `server/cad/importers/step.js`
- `src/cad/api.ts`, `src/components/CadUploadPanel.tsx`, `src/components/Header.tsx`, `src/styles.css`
- `tests/frontend/CadUploadPanel.test.tsx`
- `README.md`, `CHANGELOG.md`

## Исправленные ошибки в ходе разработки

Первый тестовый прогон показал, что ранние ошибки поврежденного и пустого STEP теряли исходные коды из-за отсутствия пустого contact result. Исправлено: `INVALID_STEP_FILE` и `EMPTY_MODEL` снова проходят через API без подмены. Frontend-тест был уточнен после появления двух корректных значений `0,0006 м²` — полной и окрашиваемой площади.

## Известные ограничения

- Проверены плоские и соосные цилиндрические контактные поверхности. Общая поддержка произвольных B-spline/NURBS, резьб, объемной интерференции, шероховатости и деформируемых посадок не заявлена.
- Потенциальная область малого плоского зазора строится ортогональной проекцией и всегда требует решения пользователя.
- Первый холодный запуск OCCT/WASM и BREP-union требует заметно больше времени и памяти.
- Задания, BREP-области и ручные решения хранятся в памяти процесса и теряются при перезапуске.
- Стабильность ID гарантируется только для повторной обработки того же неизмененного STEP в текущей версии алгоритма.
- Визуальное выделение контактов в 3D не реализовано.
