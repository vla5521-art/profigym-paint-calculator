# STAGE7 CI fix report

Application version: **2.0.1**  
Target root: `PROFiGYM_calculator_v2.0.1_STAGE7_CI_FIXED`  
Final status: **CI_FIXED_READY_FOR_GITHUB**

## Исходная ошибка

`container` не мог подготовить job из-за ссылки Trivy без префикса `v`: `aquasecurity/trivy-action@` + `0.30.0`. Официальный репозиторий использует release-теги с префиксом `v`; выбран и проверен существующий стабильный release **`aquasecurity/trivy-action@v0.36.0`** (официальный release, проверено 2026-07-31).

Trivy настроен на `image-ref`, `format: sarif`, файл `trivy-results.sarif`, `HIGH,CRITICAL`, `exit-code: 1`, `ignore-unfixed: true` и `limit-severities-for-sarif: true`. SARIF передаётся через официальный `github/codeql-action/upload-sarif@v4` с `security-events: write`; artifact upload имеет `if-no-files-found: warn`.

## Другие найденные и исправленные ошибки

- Все официальные actions обновлены и зафиксированы на существующих major/release tags; список и источники находятся в `CI_ACTIONS.md`.
- Удалена ненужная permission `id-token`; сохранены только `contents`, `packages` и `security-events`, необходимые container workflow.
- Fork PR не выполняет GHCR login/push; PR-сборка использует `load: true`. Push-сборка публикуется, затем явно `docker pull` перед локальным smoke.
- Многострочный `metadata-action` output больше не передаётся как одно имя image: создаётся отдельный однострочный `steps.image.outputs.ref` из первого официального tag output.
- Image digest сохраняется отдельно в text и JSON artifacts.
- Добавлены CodeQL SARIF upload, безопасные artifact conditions и гарантированный cleanup Compose.
- `deploy.yml` теперь только `workflow_dispatch`: без VPS secrets preflight успешно сообщает controlled skip, а не создаёт красный push. Production требует GitHub Environment approval и immutable `sha256` digest.
- Deploy выполняет integrity check и backup до migration, readiness и HTTP smoke после старта; rollback восстанавливает проверенный backup и предыдущий digest.
- VPS deploy script больше не требует Node.js на хосте для чтения backup ID.
- Docker build stage теперь копирует обязательный template verifier до `npm run build`.
- Добавлен `volume-init`, чтобы non-root app/worker получали доступ к named volumes; app и worker используют один image с разными командами.
- Production Compose использует `!override`, исключая случайное сохранение локального порта и local nginx mount.
- Исправлен backup profile: он запускал отсутствующий `server/backup-cli.js`, теперь используется упакованный `scripts/backup-cli.mjs create`.
- Production smoke не импортирует внутренние функции приложения и работает только по HTTP.
- Secret scanner отличает runtime shell interpolation от сохранённого literal secret, сохраняя self-check реального обнаружения.
- Добавлен фактический atomic restore с safety copy и тест восстановления содержимого.
- Node test runner выполняет тяжёлые OCCT/WASM integration-файлы последовательно: на холодной распакованной копии параллельная компиляция приводила к двум `ECONNRESET`; после исправления Node/API снова проходит 106/106.
- Application version обновлена до `2.0.1`; geometry/contact/feature algorithm versions не изменялись.

## CI validation

- `npm run ci:validate`: **PASS**.
- actionlint: **PASS**, 3 workflow files.
- YAML, expressions, outputs, permissions, conditions, audited inputs и shell syntax: **PASS**.
- Official action tag lookup: **PASS**, 9 action families / 31 references.
- Forbidden Trivy reference без `v`: отсутствует как цельный текст во всём проекте.

## Чистый npm CI

- `npm ci`: **PASS**, 409 packages.
- lint/typecheck: **PASS**.
- Node/API: **106/106**; jsdom: **12/12**.
- golden: **38/38**; regression: **35/35**; determinism: **PASS**.
- security/fuzz: **26/26** extended and **4/4** API suite; concurrency: **2/2**.
- build/template verification: **PASS**.
- Chromium: **27/27**; accessibility: **2/2**.
- npm audit: 0 vulnerabilities; CycloneDX SBOM: 459 components; licenses: 459/459; secret scan: 0 findings.

## Production checks

- Local separate-process API/worker orchestration: **PASS**.
- HTTP-only smoke: **39/39**.
- Worker readiness: **503 while stopped → 200 after restart**.
- Observability: **24/24**.
- Backup/restore and rollback marker: **PASS**; atomic restore tests: **3/3**.
- Docker build: **NOT_RUN_DOCKER_UNAVAILABLE**.
- Compose runtime/config command: **NOT_RUN_DOCKER_UNAVAILABLE**; static Compose/YAML/upstream/service checks: **PASS**.
- Trivy runtime scan: **NOT_RUN_REQUIRES_DOCKER_OR_GITHUB_CI**.
- Remote GitHub Actions: **NOT_RUN_NO_REMOTE_RUN_ID**.
- VPS deploy: **NOT_RUN**.

## Проверка ZIP

Архив-кандидат распакован в новый каталог. Из него выполнены чистый `npm ci`, `npm run ci:validate`, lint/typecheck, весь Node/jsdom/golden/regression/determinism/security набор, build/template, Chromium 27/27, a11y 2/2, supply-chain и production-like separate-process smoke. CRC, единственная корневая папка, отсутствие запрещённой ссылки, наличие `v0.36.0`, UTF-8-флаги и SHA-256 обеих копий Excel-шаблона подтверждены. Результат: **PASS**.

## Ограничения и итог

В среде проверки нет Docker CLI/daemon, поэтому нельзя честно заявлять container build, Compose runtime, image smoke или Trivy image scan. Эти операции полностью настроены в `container.yml` и должны стать первой удалённой проверкой после загрузки.

Проверка ZIP зафиксирована в `diagnostic-reports/final-archive-verification.json`. Допустимый итоговый статус без Docker: **CI_FIXED_READY_FOR_GITHUB**.
