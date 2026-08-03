# История изменений

## 2.0.3 — 2026-08-03

- Browser E2E job устанавливает системный ffmpeg, проверяет его версию, определяет фактический путь через `command -v ffmpeg` и экспортирует `PLAYWRIGHT_FFMPEG_PATH`.
- Подготовка Playwright использует `PLAYWRIGHT_FFMPEG_PATH`, затем `command -v ffmpeg`; жёсткий fallback `/usr/bin/ffmpeg` удалён, идемпотентная и конкурентно-безопасная публикация внутри `.tmp` сохранена.
- Trivy разделён на диагностическую таблицу, генерацию SARIF с `exit-code: 0`, проверку JSON/SARIF, загрузку через CodeQL и отдельный блокирующий table scan с `exit-code: 1`.
- Ошибки загрузки SARIF больше не скрываются через `continue-on-error`.
- Все Docker stages обновлены до поддерживаемого patch-tag `node:24.18.1-bookworm-slim`; production npm audit не обнаружил уязвимостей.
- Версия приложения обновлена до 2.0.3; версии geometry/contact/feature и бизнес-логика расчёта площади не изменены.

## 2.0.2 — 2026-08-03

- Удалена команда `npm cache clean --force` из production dependencies стадии Dockerfile, где `/root/.npm` подключён как BuildKit cache mount; воспроизводимая установка сохранена через `npm ci --omit=dev --ignore-scripts`.
- Подготовка Playwright ffmpeg сделана идемпотентной: существующие рабочие файл/ссылка повторно используются, неправильная или битая ссылка безопасно заменяется только внутри `.tmp`, конкурентный `EEXIST` повторно проверяется.
- Chromium/SwiftShader runtime извлекается в уникальный временный каталог и публикуется атомарно, поэтому параллельная подготовка не удаляет готовое окружение другого процесса.
- Добавлены regression-тесты повторного запуска, рабочего файла, рабочей ссылки, битой ссылки, конкурентного `EEXIST`, параллельной подготовки и Docker cache mount.
- Версия приложения обновлена до 2.0.2; версии geometry/contact/feature не изменены.

## 2.0.1 — 2026-07-31

- Исправлена недействительная ссылка Trivy без префикса `v` (`aquasecurity/trivy-action@` + `0.30.0`); используется подтверждённый официальный release `v0.36.0`.
- Обновлены официальные GitHub Actions, добавлены actionlint и `npm run ci:validate` с policy/online tag verification.
- Исправлены image tag, push/load/pull, SARIF upload, artifact fallback и digest evidence в container workflow.
- Deploy переведён на явный `workflow_dispatch`, immutable digest, secret preflight, GitHub Environment, backup, readiness, HTTP smoke и rollback с восстановлением БД.
- Исправлен Docker build: postbuild-проверка Excel-шаблона теперь доступна в build stage.
- Добавлен `volume-init` для writable named volumes при запуске app/worker под `USER node`; production ports/volumes используют Compose override.
- Production smoke полностью использует HTTP и не импортирует внутренние функции приложения.
- Версия приложения обновлена до 2.0.1; версии geometry/contact/feature не изменены.

## 1.8.1 — 2026-07-31

- Добавлены настоящие Playwright Chromium E2E для WebGL Viewer и полного Stage 5 UI workflow.
- Добавлены SwiftShader, WebGL fallback, responsive и accessibility проверки.
- Исправлены горизонтальное переполнение, возврат фокуса и тестовая orchestration persistence.

## 1.8.0 — 2026-07-31

- Добавлена backend-триангуляция OCCT и Three.js viewer с исходными `faceId`, отдельными контактными patch-сетками, стандартными видами и WebGL fallback.
- Добавлена встроенная SQLite БД, миграции, безопасное хранение STEP/mesh, список, поиск, переименование, дублирование и удаление расчётов.
- Реализованы повторный расчёт без загрузки STEP, ревизии и восстановление совместимых ручных решений.
- Добавлены JSON Schema/JSON-отчёт и standalone HTML-отчёт для печати в PDF.
- Добавлен проверяемый PNG/JPEG preview из Viewer с ограничением MIME, размера, разрешения и владения расчётом.
- Экран проверки получил вкладки, поиск, фильтры, сортировку, массовые решения и повторное редактирование сохранённого расчёта.
- Retention-политика удаляет устаревшие STEP, а source/mesh/preview references проверяются на принадлежность calculation ID.
- Окрашиваемая площадь передаётся в калькулятор ЛКМ только после подтверждения; источник и ручная замена явно отображаются.
- Добавлены API/E2E/frontend-тесты, `smoke:workflow`, `benchmark:viewer` и `benchmark:persistence`.
- Сохранены STEP-only границы, алгоритмы этапов 2–4 и Unicode-шаблон Excel.

## 1.7.0 — 2026-07-31

- Добавлен отдельный конвейер распознавания технологических элементов после contact detection.
- Реализованы реальные B-Rep-признаки внутреннего цилиндра, группировка соосных участков, дна, переходов и конической зенковки.
- На STEP-фикстурах подтверждены сквозные, глухие, ступенчатые, зенкованные, цекованные и пересекающиеся отверстия, закрытые/открытые полости и отрицательный пример паза.
- Добавлен конфигурируемый rule engine с глобальными значениями по умолчанию и изолированными правилами задания.
- Добавлены ручные решения, создание/удаление `manual_feature` по face ID и немедленный пересчёт.
- Контакты и features объединяются по исходной B-Rep-грани; raw, overlap и unique площади показываются отдельно.
- Расширены API и frontend: восемь карточек, таблица features, панель правил и выбор граней.
- Добавлены 12 воспроизводимых STEP-фикстур, unit/integration/API/frontend-тесты, `smoke:features` и `benchmark:features`.
- Сохранены STEP-only границы и Excel-шаблон с точным Unicode-именем.
- Версия проекта и интерфейса обновлена до `1.7.0`.

## 1.6.0 — 2026-07-31

- Добавлен отдельный конвейер определения контактов: AABB broad phase, точный OCCT narrow phase, классификация и расчет исключений.
- Подтверждены реальные STEP-сценарии полного и частичного плоского контакта, цилиндрической посадки, касания, малого зазора, нескольких зон и отсутствия контакта.
- Частичное перекрытие рассчитывается B-Rep операцией `Common`, а не площадью меньшей грани.
- Обе стороны подтвержденного контакта исключаются; повторные области объединяются перед суммированием.
- Добавлены стабильные `contactId`, сводка в мм²/см²/м², статистика broad/narrow phase и защита от отрицательной площади.
- Добавлены API получения контактов и ручных решений confirm/reject/reset с немедленным пересчетом.
- Frontend показывает четыре итоговые площади, таблицу контактов и решения для `review_required`.
- Добавлены воспроизводимые STEP-фикстуры, unit/integration/API/frontend-тесты, smoke-test и benchmark контактов.
- Версия проекта и интерфейса обновлена до `1.6.0`.

## 1.5.1 — 2026-07-31

- MVP ограничен форматами STEP `.stp` и `.step`.
- Удалены нативные CAD-форматы, адаптер конвертации, связанные настройки, скрипты, тестовые данные и интерфейсные состояния.
- Добавлены модульный реестр импортёров с единственной STEP-реализацией и проверка MIME/структуры ISO 10303-21.
- Удалено поле времени конвертации из API, отчётов и frontend.
- Добавлены проверки отклонения `.sldprt`, `.sldasm`, `.txt`, поврежденного и пустого STEP.
- Добавлены тесты повторного импорта и уникальности идентификаторов граней.
- Подтверждён и сохранён обязательный Excel-шаблон импорта; тест проверяет лист и точные заголовки, live smoke-test — доступность и SHA-256 скачиваемого файла.
- Версия и корневая папка приведены к `1.5.1`.

## 1.5.0 — 2026-07-31

- Реализован точный STEP B-Rep импорт на Open Cascade Technology 8.
- Добавлены площади модели, тел и граней в мм², см² и м².
- Добавлены топология, устойчивые ID граней, единицы и валидация геометрии.
- Добавлены API `/api/cad/import`, `/api/cad/job/{id}`, `/api/cad/report/{id}`.
- Добавлены экран обработки и диагностический отчет.
- Добавлены эталонные STEP-модели, unit/integration/API/frontend-тесты и живой smoke-test.
- Добавлены лицензии, отчет этапа и диагностические JSON-отчеты.

## 1.3.1 — 2026-07-29

- Исправлена ошибка TypeScript TS2322 в `xlsxZipReader.ts` при создании `Blob` из `Uint8Array<ArrayBufferLike>`.
- Перед созданием `Blob` данные копируются в новый `Uint8Array` с гарантированным `ArrayBuffer`.
- Обновлён номер версии приложения.

# CHANGELOG

## 1.3.0 — 2026-07-29

- Добавлен полный пользовательский импорт материалов из фиксированного Excel-шаблона.
- Добавлены схема 1.2, миграция 1.1→1.2, `material_substrates`, `import_batches`, `user_excel_import`, `substrate_unspecified`.
- Добавлены нормализация, детерминированные ID, поиск/создание производителей, материалов и поверхностей.
- Добавлено обновление default-нормы в `unit_kg_m2`, конфликтная проверка и идемпотентность.
- Добавлены IndexedDB-хранилище, активный пользовательский снимок, backup, rollback, восстановление и очистка.
- Добавлены PersistentDatabaseRepository, экспорт активной базы в JSON и reload после импорта.
- Добавлен интерфейс импорта без ручного mapping в дизайне PROFiGYM.
- Сохранены калькулятор и печать расчёта.
- Добавлены 9 автоматических тестов.
# 2.0.0 — 2026-07-31

- Тяжёлая STEP/OCCT-обработка вынесена из HTTP-процесса в отдельный worker.
- Добавлена durable SQLite queue с atomic claim, heartbeat, stale recovery, cancellation, bounded retry и concurrency limit.
- Добавлены production storage layout, retention cleanup, consistent backup/verify/restore-test и расширенные SQLite PRAGMA/checks.
- Добавлены JSON logs, request/correlation ID, Prometheus metrics, health/startup/readiness и worker awareness.
- Добавлены token-to-HttpOnly-session auth, rate limits, CORS allowlist, security headers и опциональный ClamAV profile.
- Добавлены multi-stage non-root Docker image, Compose proxy/app/worker, resource limits, read-only roots и persistent volumes.
- Добавлены Prometheus alerts, импортируемый Grafana dashboard, container/deploy workflows, VPS deployment and rollback scripts.
- Добавлены production, observability, backup и rollback smoke tests, supply-chain commands и production runbooks.
- STEP-only граница и версии geometry 2.0/contact 3.0/feature 4.0 не изменены.

# 1.9.0 — 2026-07-31

- Добавлен версионируемый golden dataset из 38 STEP-моделей и манифест SHA-256.
- Добавлены B-Rep golden, regression, determinism, double-subtraction/unit, security/API и concurrency tests.
- Добавлены benchmark small/medium/large, memory trend, short soak, backup/restore и единый TEST_REPORT.
- Добавлены 12 browser E2E этапа 6; functional и a11y JSON больше не перезаписывают друг друга.
- Добавлен GitHub Actions quality workflow из семи jobs.
- Версии geometry/contact/feature сохранены без изменений.
