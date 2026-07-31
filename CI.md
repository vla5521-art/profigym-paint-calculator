# CI/CD

- `quality.yml` сохраняет проверки этапа 6.
- `container.yml` выполняет lint/typecheck/tests/golden/security/build, supply-chain checks, multi-stage image build, Trivy scan, image smoke, SBOM/provenance и публикует только для разрешённых push/tag событий.
- `deploy.yml` использует immutable `sha-<full git sha>`, GitHub Environments `staging`/`production`, SSH secrets и controlled maintenance deployment. Approval production настраивается required reviewers в GitHub Environment.

Pull request не публикует image и не запускает deploy. Push в `main` предназначен для staging; tag `v*` — production candidate. Host/user/key/path/token/URL не находятся в репозитории. Предыдущий успешный image хранится в `.deployment/previous-image` на VPS.

В локальном архиве workflows подготовлены, но удалённые run IDs появляются только после фактического запуска в GitHub Actions.
