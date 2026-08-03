# CI/CD — версия 2.0.2

## Локальная валидация

```bash
npm ci
npm run ci:validate
```

`ci:validate` проверяет три workflow actionlint’ом, затем контролирует shell syntax, `${{ ... }}`/outputs, permissions, action versions и inputs, запрет старой ссылки Trivy (`aquasecurity/trivy-action@` + `0.30.0`), HTTP-only production smoke, статическую согласованность Compose и отсутствие `npm cache clean --force` в Docker BuildKit npm cache mounts. Разрешённые версии перечислены в `CI_ACTIONS.md`.

## quality.yml

Семь независимых jobs работают на чистом `ubuntu-latest`, Node `24.14.0`, `npm ci` и npm cache. Browser job извлекает Chromium 149 из `@sparticuz/chromium`, использует SwiftShader, сохраняет раздельные functional/a11y JSON, Playwright HTML report, trace при retry и video только при failure. Подготовка ffmpeg повторно использует рабочий файл/ссылку, заменяет только битую или неправильную ссылку внутри `.tmp` и повторно проверяет конкурентный `EEXIST`; Chromium runtime публикуется атомарно. Все artifact steps используют `if-no-files-found: warn`.

## container.yml

Последовательность: checkout → Node/npm ci → CI validation → lint/typecheck/tests/build/template → supply-chain → Buildx → fork-safe GHCR login → metadata → build → digest → pull pushed image (или load для PR) → Trivy → SARIF upload → image smoke → artifacts.

- Pull request: `push=false`, `load=true`, login не выполняется.
- Push/tag/manual: image публикуется, затем явно выполняется `docker pull` перед локальным Trivy/smoke.
- Единственный image ref берётся из первой строки официального `steps.meta.outputs.tags` и сохраняется как step output.
- Trivy: `aquasecurity/trivy-action@v0.36.0`, SARIF, HIGH/CRITICAL, `exit-code=1`, `limit-severities-for-sarif=true`.
- SARIF отправляется через `github/codeql-action/upload-sarif@v4`; fork PR пропускается, локальный artifact остаётся.
- `contents:read`, `packages:write`, `security-events:write`; `id-token` не запрашивается.

## deploy.yml

Deploy не запускается на обычном push. Только `workflow_dispatch` с environment и digest `sha256:...`. Preflight проверяет наличие secrets и формат входов; при отсутствии конфигурации job завершаетcя успешно, а deploy job получает `skipped`. Production job привязан к GitHub Environment `production`, где владелец должен настроить required reviewer.

Workflow синхронизирует только проверенные Compose/nginx/observability/deploy-файлы, запускает backup до migration, deploy по `ghcr.io/...@sha256:...`, readiness и полный HTTP smoke. При ошибке deploy или smoke запускается rollback image и восстановление pre-deploy SQLite backup.

Удалённые run ID отсутствуют до фактической загрузки проекта в GitHub.
