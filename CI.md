# CI/CD — версия 2.0.4

## Локальная валидация

```bash
npm ci
npm run ci:validate
```

`ci:validate` проверяет три workflow actionlint’ом, затем контролирует shell syntax, `${{ ... }}`/outputs, permissions, action versions и inputs, запрет старой ссылки Trivy (`aquasecurity/trivy-action@` + `0.30.0`), HTTP-only production smoke, статическую согласованность Compose, отсутствие `npm cache clean --force` в Docker BuildKit npm cache mounts и npm-free production runtime. Разрешённые версии перечислены в `CI_ACTIONS.md`.

## quality.yml

Семь независимых jobs работают на чистом `ubuntu-latest`, Node `24.18.1`, `npm ci` и npm cache. Browser job устанавливает Ubuntu `ffmpeg`, выводит `ffmpeg -version`, определяет реальный путь через `command -v ffmpeg` и сохраняет его в `PLAYWRIGHT_FFMPEG_PATH`. Затем job извлекает Chromium 149 из `@sparticuz/chromium`, использует SwiftShader и сохраняет раздельные functional/a11y JSON, Playwright HTML report, trace при retry и video только при failure. Подготовка ffmpeg повторно использует рабочий файл/ссылку, заменяет только битую или неправильную ссылку внутри `.tmp` и повторно проверяет конкурентный `EEXIST`; Chromium runtime публикуется атомарно.

## container.yml

Последовательность: checkout → Node/npm ci → CI validation → lint/typecheck/tests/build/template → supply-chain → Buildx → fork-safe GHCR login → metadata → build → digest → pull pushed image (или load для PR) → проверка Node и отсутствия npm/corepack/yarn в runtime → Trivy table → SARIF → SARIF validation → upload → Trivy enforce → image smoke → artifacts.

- Pull request: `push=false`, `load=true`, login не выполняется.
- Push/tag/manual: image публикуется, затем явно выполняется `docker pull` перед локальным Trivy/smoke.
- Единственный image ref берётся из первой строки официального `steps.meta.outputs.tags` и сохраняется как step output.
- Build/dependencies stages используют npm; production stage запускается напрямую через `node`, а глобальные npm/corepack/yarn и их CLI-ссылки в ней отсутствуют.
- Trivy: `aquasecurity/trivy-action@v0.36.0`; диагностический table scan и SARIF generation используют `exit-code=0`, затем SARIF проверяется через `jq` и отправляется через `github/codeql-action/upload-sarif@v4`.
- После загрузки выполняется отдельный table scan с `CRITICAL,HIGH`, `ignore-unfixed=true`, `vuln-type=os,library` и `exit-code=1`; обязательный шаг остаётся блокирующим.
- Fork PR пропускает только SARIF upload из-за permissions; локальный SARIF artifact и блокирующий Trivy scan сохраняются.
- `contents:read`, `packages:write`, `security-events:write`; `id-token` не запрашивается.

## deploy.yml

Deploy не запускается на обычном push. Только `workflow_dispatch` с environment и digest `sha256:...`. Preflight проверяет наличие secrets и формат входов; при отсутствии конфигурации job завершаетcя успешно, а deploy job получает `skipped`. Production job привязан к GitHub Environment `production`, где владелец должен настроить required reviewer.

Workflow синхронизирует только проверенные Compose/nginx/observability/deploy-файлы, запускает backup до migration, deploy по `ghcr.io/...@sha256:...`, readiness и полный HTTP smoke. При ошибке deploy или smoke запускается rollback image и восстановление pre-deploy SQLite backup.

Удалённые run ID отсутствуют до фактической загрузки проекта в GitHub.
