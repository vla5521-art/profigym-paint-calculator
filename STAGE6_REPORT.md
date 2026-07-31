# STAGE6_REPORT

Версия: 1.9.0. Фактический статус испытаний: **PASS**.

## Архитектура пакета

Наборы разделены на unit/integration, API, B-Rep golden, regression, determinism, security, browser E2E, performance, memory, soak, concurrency и migrations. Каждый suite пишет отдельный JSON; TEST_REPORT собирается только из этих файлов. STEP-only архитектура, production OCCT pipeline, SQLite и настоящий Chromium/WebGL сохранены.

## Эталонный набор

plate.step, cube.step, rectangular_box.step, cylinder.step, sphere.step, through_hole.step, blind_hole.step, stepped_hole.step, countersunk_hole.step, counterbored_hole.step, intersecting_holes.step, closed_internal_cavity.step, open_internal_cavity.step, slot_not_hole.step, contact_and_hole_overlap.step, multiple_features.step, two_plates_full_contact.step, two_plates_partial_overlap.step, cylindrical_fit.step, tangent_contact.step, tangent_line_contact.step, small_gap_below_tolerance.step, gap_above_tolerance.step, multiple_contacts.step, multi_body_no_contact.step, ten_plates_chain_contacts.step, large_model.step, invalid.step, empty.step, open_shell.step, duplicate_contact_regions.step, overlapping_features.step, manual_exclusion_overlap.step, high_face_count.step, deeply_nested_step_entities.step, mixed_units_mm.step, mixed_units_cm.step, mixed_units_m.step

Всего 38 версионируемых STEP-файлов. SHA-256, топология, площади, контакты, features, статусы и допуски хранятся в golden-manifest.json.

## Методика эталонов и допуски

Аналитические формулы и параметры приведены в GOLDEN_MODELS.md. Для CSG-моделей применяется независимое чтение топологии OCCT; допустимое отклонение — 0,05 мм² или 1e-6 относительно, достаточно выполнения любого ограничения. Манифест не обновляется в CI; обновление regression snapshots выполняется только явной командой.

## Фактические результаты

- Node unit/integration/API: 103/103; frontend jsdom: 12/12.
- Golden B-Rep: 38/38; regression snapshots: 35/35.
- Максимальные отклонения: 0 мм² и 0 относительного отклонения.
- Determinism: PASS (5 повторов в процессе + 3 отдельных Node-процесса для 5 ключевых моделей).
- Security upload/API: 26/26; path traversal, расширения/MIME, size boundary, content spoofing, oversized JSON и invalid IDs проверены реальными HTTP-запросами.
- Chromium functional E2E: 27/27; accessibility: 2/2; отдельные JSON не перезаписываются.
- Benchmark full workflow median: small 16.123 ms; medium 29.343 ms; large 279.143 ms, по 5 прогретых итераций и отдельный cold start.
- Memory: PASS, 20 последовательных обработок, прирост heap 175427 байт, неконтролируемый рост не обнаружен.
- CI-soak: PASS, 1406 циклов за 30 с, ошибок 0.
- Migrations/backup-restore: 2/2.
- CI: настроен .github/workflows/quality.yml с семью изолированными jobs; удалённый GitHub Actions в локальной среде не запускался.

## Исправленные дефекты

- Файл ровно установленного лимита ранее ошибочно отклонялся middleware; граница теперь принимается, превышение на 1 байт возвращает 413.
- Слишком большой JSON body ранее мог возвращать 500 без request ID; теперь возвращается управляемый 413 REQUEST_TOO_LARGE.
- Timeout-job ранее оставлял неполную diagnostics-структуру и вызывал ошибку React при отображении; ошибка теперь имеет полный публичный результат, повторная загрузка работает.
- Тестовые API-наборы переведены на отдельные SQLite/storage-каталоги, исключив взаимные блокировки и пользовательскую БД.
- Миграция теперь отвергает неизвестную более новую schema version; backup/restore проверяет hash и повреждённые копии.

## Известные ограничения

- Firefox/WebKit require separately installed Playwright browsers.
- Memory report measures process.memoryUsage after iterations, not true OS peak.
- Timeout cancellation hook is active only in NODE_ENV=test; OCCT/WASM calls are serialized and are not force-terminated mid-call.
- Fixtures duplicate_contact_regions, manual_exclusion_overlap and deeply_nested_step_entities reuse deterministic CSG source geometries and document this limitation.
