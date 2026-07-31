# GitHub Actions version policy

lastVerifiedAt | 2026-07-31

Версии проверены по официальным release/tag страницам. Разрешены только перечисленные official actions; `npm run ci:validate` отклоняет неизвестные actions, неверные версии, устаревшую ссылку `aquasecurity/trivy-action@` + `0.30.0` и неподдерживаемые inputs. В GitHub Actions дополнительно выполняется онлайн-проверка существования тегов через GitHub API.

| action | version | source | reason | lastVerifiedAt |
|---|---|---|---|---|
| actions/checkout | v7 | https://github.com/actions/checkout/releases/tag/v7.0.1 | Актуальный официальный major на Node 24 | 2026-07-31 |
| actions/setup-node | v6 | https://github.com/actions/setup-node/releases/tag/v6.5.0 | Официальная установка Node и npm cache | 2026-07-31 |
| actions/upload-artifact | v7 | https://github.com/actions/upload-artifact/releases/tag/v7.0.1 | Официальная загрузка артефактов; везде задан `if-no-files-found` | 2026-07-31 |
| docker/setup-buildx-action | v4 | https://github.com/docker/setup-buildx-action/releases/tag/v4.2.0 | Актуальный официальный Buildx action | 2026-07-31 |
| docker/login-action | v4 | https://github.com/docker/login-action/releases/tag/v4.6.0 | Официальный GHCR login; пропускается для pull request | 2026-07-31 |
| docker/metadata-action | v6 | https://github.com/docker/metadata-action/releases/tag/v6.2.0 | Официальные SHA/semver tags и OCI labels | 2026-07-31 |
| docker/build-push-action | v7 | https://github.com/docker/build-push-action/releases/tag/v7.3.0 | Официальная BuildKit build/push, cache, SBOM и provenance | 2026-07-31 |
| aquasecurity/trivy-action | v0.36.0 | https://github.com/aquasecurity/trivy-action/releases/tag/v0.36.0 | Подтверждённый immutable release с `v`-prefix; поддерживает image/SARIF/severity/exit-code | 2026-07-31 |
| github/codeql-action/upload-sarif | v4 | https://github.com/github/codeql-action/releases/tag/v4.37.4 | Официальная загрузка Trivy SARIF в GitHub Security | 2026-07-31 |

## Проверка

```bash
npm ci
npm run ci:validate
```

Команда запускает actionlint для `quality.yml`, `container.yml`, `deploy.yml`, проверяет shell-синтаксис `run`-шагов, action inputs/permissions/conditions/outputs, статическую согласованность Compose и документированную политику версий. При недоступной сети локальная проверка помечает online tag check как `SKIPPED_NETWORK_UNAVAILABLE`; в GitHub Actions недоступность или отсутствие тега является ошибкой.
