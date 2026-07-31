# Отчет об исправлении этапа 2 — STEP-only MVP

Дата проверки: 2026-07-31  
Точная версия: **1.5.1**  
Корневая папка: `PROFiGYM_calculator_v1.5.1_STAGE2_STEP_ONLY`

## Основа работы

Исправления внесены непосредственно в проект из приложенного архива `PROFiGYM_calculator_v1.5.0_STAGE2_CAD_BREP(2).zip`. Исходная корневая папка архива `PROFiGYM_calculator_v1.3.1` переименована; новый проект с нуля не создавался.

## Исправленные недостатки

- MVP ограничен форматами STEP `.stp` и `.step` на frontend, backend и API.
- Удалены маршруты обработки нативных CAD-файлов, настройки окружения, скрипты, фиктивный адаптер, тестовая модель и диагностический отчет SLDPRT.
- Удалены связанные с конвертацией поля производительности, сообщения и состояния интерфейса.
- Добавлена модульная архитектура импортёров. Зарегистрирован только STEP-импортёр; расчетное OCCT-ядро отделено от входного формата.
- Backend проверяет расширение, допустимый MIME и базовую структуру STEP ISO 10303-21 до B-Rep-обработки.
- Добавлена отдельная диагностика `INVALID_STEP_FILE` для поврежденного контейнера и `EMPTY_MODEL` для STEP без сущностей.
- Сохранены OCCT B-Rep импорт, топология, площади, единицы, диагностика, асинхронные задания, отчеты и frontend.
- Проверена детерминированность face ID при двух загрузках одного файла и уникальность ID внутри модели.
- Версия проекта, интерфейса, package-файлов и документации обновлена до 1.5.1.

## Удаленные файлы

- `server/cad/converter.js`
- `scripts/convert-sldprt.ps1`
- `scripts/test-sldprt-converter.mjs`
- `tests/cad-sldprt.integration.mjs`
- `test-models/mock_cube.sldprt`
- `diagnostic-reports/mock_cube.json`

Отдельных npm-зависимостей, использовавшихся исключительно удаленным адаптером, в исходном `package.json` не было.

## Созданные файлы

- `server/cad/importers/index.js`
- `server/cad/importers/step.js`
- `tests/cad-importers.test.mjs`
- `test-models/empty.step`
- `diagnostic-reports/empty.json`
- `STAGE2_CORRECTION_REPORT.md`

## Измененные файлы

- `.env.example`
- `BUILD_REPORT.md`
- `CHANGELOG.md`
- `README.md`
- `STAGE1_REPORT.md`
- `STAGE2_REPORT.md`
- `THIRD_PARTY_NOTICES.md`
- `package.json`
- `package-lock.json`
- `server/app.js`
- `server/config.js`
- `server/cad/kernel.js`
- `server/cad/processor.js`
- `scripts/generate-cad-fixtures.mjs`
- `scripts/run-live-smoke.mjs`
- `scripts/smoke-test.mjs`
- `src/cad/api.ts`
- `src/cad/validation.ts`
- `src/components/CadUploadPanel.tsx`
- `src/components/Header.tsx`
- `tests/cad-api.test.mjs`
- `tests/cad-kernel.test.mjs`
- `tests/cad-validation.test.mjs`
- `tests/frontend/CadUploadPanel.test.tsx`
- `diagnostic-reports/box_10x20x30mm.json`
- `diagnostic-reports/corrupted.json`
- `diagnostic-reports/cube_10mm.json`
- `diagnostic-reports/cylinder_r10_h20mm.json`
- `diagnostic-reports/open_box_shell.json`
- `diagnostic-reports/smoke-summary.json`
- `diagnostic-reports/sphere_r10mm.json`
- `diagnostic-reports/two_body.json`
- production-артефакты в `dist/`

## Добавленные и усиленные тесты

- прием `.stp`;
- прием `.step`;
- отклонение `.sldprt`, `.sldasm`, `.txt` и другого расширения;
- отклонение несовместимого MIME;
- поврежденный STEP;
- пустой STEP-контейнер;
- куб, параллелепипед, цилиндр и сфера;
- многотельная модель;
- открытая оболочка и отсутствие тел;
- повторный импорт одного STEP с равными face ID;
- уникальность face ID внутри модели;
- единственный зарегистрированный STEP-импортёр;
- конфигурация API только с `.stp` и `.step`;
- HTML `accept=".stp,.step"`;
- frontend-валидация, статус, площадь, диагностика, ошибки и таблица граней.

## Фактические результаты команд

| Команда | Результат |
|---|---|
| `npm install` | Успешно: 378 пакетов. Первый запуск не смог создать системный кэш `/root/.npm`; после переноса npm-кэша в `/tmp` команда успешно повторена. |
| `npm run lint` | Успешно, 0 ошибок. |
| `npm run typecheck` | Успешно, 0 ошибок TypeScript. |
| `npm test` | Успешно: 31/31 Node/backend/unit/API и 4/4 frontend, всего 35/35. |
| `npm run build` | Успешно: TypeScript build и Vite production build, 58 модулей. |
| `npm run smoke:live` | Успешно: frontend HTTP 200, backend health HTTP 200, реальные загрузки эталонных STEP и проверки отказов. |

Первый запуск `npm test` обнаружил одно устаревшее текстовое ожидание frontend-теста. Ожидание приведено к новому сообщению STEP-only, после чего весь набор повторно прошел 35/35.

## Эталонные площади

Значения получены свежим `npm run smoke:live` после исправлений.

| Модель | Теория, мм² | Факт, мм² | Отклонение, мм² | Отклонение, % |
|---|---:|---:|---:|---:|
| Куб 10 мм | 600 | 600 | 0 | 0 |
| Параллелепипед 10×20×30 мм | 2200 | 2200 | 0 | 0 |
| Цилиндр r=10, h=20 мм | 1884.9555921538758 | 1884.955592154 | 1.24146×10⁻¹⁰ | 6.58615×10⁻¹² |
| Сфера r=10 мм | 1256.6370614359173 | 1256.637061436 | 8.27640×10⁻¹¹ | 6.58615×10⁻¹² |

## Результаты живого smoke-test

- `.stp`: обработан, площадь куба 600 мм².
- `.step`: обработаны параллелепипед, цилиндр, сфера и многотельная модель.
- Многотельная модель: 2 тела, 12 граней, предупреждение `MULTI_BODY_MODEL`.
- Открытая оболочка: ошибки `NO_BODIES` и `OPEN_SHELLS`.
- Поврежденный STEP: ошибка `INVALID_STEP_FILE`.
- Пустой STEP: ошибка `EMPTY_MODEL`.
- `.sldprt`: HTTP 415, `UNSUPPORTED_FILE_TYPE`.
- `.sldasm`: HTTP 415, `UNSUPPORTED_FILE_TYPE`.
- `.txt`: HTTP 415, `UNSUPPORTED_FILE_TYPE`.

Свежие машинно-читаемые результаты сохранены в `diagnostic-reports/smoke-summary.json`.

## Производительность smoke-test

| Модель | Импорт, мс | Расчет, мс | Полный цикл, мс |
|---|---:|---:|---:|
| Куб `.stp` (первый прогрев OCCT) | 199.762 | 15.291 | 244.057 |
| Параллелепипед `.step` | 7.420 | 9.451 | 26.298 |
| Цилиндр `.step` | 8.053 | 3.762 | 19.503 |
| Сфера `.step` | 3.058 | 2.082 | 9.348 |
| Многотельная модель | 12.864 | 8.785 | 25.044 |

## Стабильность face ID

API-тест дважды загрузил один и тот же неизмененный `cube_10mm.step`, сохранил последовательности идентификаторов граней и сравнил их. Последовательности совпали. Дополнительная проверка `Set` подтвердила отсутствие повторяющихся face ID внутри модели.

Гарантия намеренно ограничена повторной обработкой байт-в-байт того же неизмененного STEP-файла. Она не распространяется на повторный экспорт из CAD, изменение геометрии, изменение порядка сущностей STEP или разные версии модели.

## Оставшиеся ограничения

- Нативные форматы SolidWorks не поддерживаются; модель нужно экспортировать в STEP до загрузки.
- Задания и отчеты хранятся в памяти процесса и теряются при перезапуске API.
- Загруженные файлы временно хранятся на диске и удаляются по политике retention.
- Визуальная автоматизация реального браузера не выполнялась. Интерфейс проверен 4 DOM-тестами, production build и живым HTTP-smoke-test frontend/backend.
- MIME-проверка является базовой защитой; окончательная проверка содержимого выполняется структурной валидацией STEP и OCCT B-Rep импортом.

## Итог

Проект версии **1.5.1** соответствует STEP-only границам MVP: принимает только `.stp` и `.step`, сохраняет рабочий OCCT B-Rep расчет и проходит lint, typecheck, все тесты, production build и живой smoke-test.
