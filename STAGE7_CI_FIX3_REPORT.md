# PROFiGYM calculator 2.0.3 — Stage 7 CI fix 3

Дата проверки: 2026-08-03  
Исходный GitHub commit: `ea74f1a`  
Статус: `CI_FIXED_READY_FOR_GITHUB`

## Область изменений

Работа выполнена поверх проекта PROFiGYM calculator 2.0.2. Бизнес-логика расчёта площади, CAD importer и рабочая реализация этапов 1–7 не изменялись. Версии geometry/contact/feature algorithms не изменялись.

## 1. FFmpeg и browser-e2e

### Исходная ошибка

Шаг `Prepare Chromium and SwiftShader runtime` завершался сообщением:

```text
System ffmpeg executable was not found;
set PLAYWRIGHT_FFMPEG_PATH
```

Ожидаемый Playwright target: `.tmp/pw-browsers/ffmpeg-1011/ffmpeg-linux`.

### Корневая причина

Ubuntu runner не устанавливал системный FFmpeg до `npm run e2e:prepare`, а скрипт подготовки не имел надёжного fallback через `command -v ffmpeg`.

### Исправление

- В `.github/workflows/quality.yml` перед подготовкой Chromium добавлен отдельный шаг установки `ffmpeg` через `apt-get`, включая `ffmpeg -version`.
- Следующий шаг получает фактический путь через `command -v ffmpeg`, проверяет, что файл исполняемый, и записывает `PLAYWRIGHT_FFMPEG_PATH` в `GITHUB_ENV`.
- Жёсткая привязка к `/usr/bin/ffmpeg` отсутствует.
- `scripts/prepare-e2e-chromium.mjs` разрешает путь в строгом порядке:
  1. исполняемый `PLAYWRIGHT_FFMPEG_PATH`;
  2. результат `command -v ffmpeg` (`where.exe` на Windows);
  3. понятная ошибка с именем переменной и target path.
- Сохранены существующие атомарная публикация, безопасная обработка корректного файла/ссылки, битой ссылки и конкурентного `EEXIST`. Скрипт изменяет только target внутри `.tmp` и не изменяет системный FFmpeg.

### Два последовательных запуска

| Запуск | Результат |
|---|---|
| `npm run e2e:prepare`, первый | PASS — создана ссылка target на найденный системный FFmpeg и атомарно опубликован Chromium runtime |
| `npm run e2e:prepare`, второй | PASS — существующие корректные FFmpeg target и Chromium runtime повторно использованы без изменений |

Regression-набор подготовки Chromium: `9/9`, включая приоритет env, fallback к `command -v`, существующий файл, корректную/битую symlink и конкурентный `EEXIST`.

## 2. Trivy и SARIF

### Исходная ошибка

Единственный Trivy scan одновременно создавал SARIF и имел `exit-code: 1`. Из-за этого список CVE не был виден как table, диагностика обрывалась до полного отчёта, а GitHub Code Scanning показывал `No summary of scanned files reported by Trivy` и configuration error.

### Исправленная последовательность

В `.github/workflows/container.yml` используется официальный `aquasecurity/trivy-action@v0.36.0` и один и тот же выбранный image reference:

1. `Show Trivy vulnerabilities` — `table`, `CRITICAL,HIGH`, `ignore-unfixed: true`, `vuln-type: os,library`, `exit-code: 0`.
2. `Generate Trivy SARIF` — `sarif`, файл `trivy-results.sarif`, те же фильтры, `exit-code: 0`, `limit-severities-for-sarif: true`.
3. `Validate Trivy SARIF` — проверка существования/непустого файла и структуры JSON/SARIF 2.1.0 через `jq`.
4. `Upload Trivy SARIF to GitHub Security` — `github/codeql-action/upload-sarif@v4` с `sarif_file: trivy-results.sarif` и без `continue-on-error`.
5. `Enforce Trivy policy` — отдельный table scan с `exit-code: 1`; это единственный блокирующий Trivy scan.

Таким образом таблица и SARIF создаются и загружаются до применения политики. Severity не снижена, `ignore-unfixed: true` сохранён, CVE exclusions не добавлялись.

## 3. Уязвимости и обновления

Локальный `npm audit --omit=dev` завершился с результатом `found 0 vulnerabilities`. Совместимые npm-зависимости не требовали обновления и не изменялись. `npm audit fix --force` не использовался.

Production base image обновлён с `node:24.14.0-bookworm-slim` до актуального поддерживаемого patch tag `node:24.18.1-bookworm-slim` во всех стадиях Dockerfile. Runtime остаётся минимальным: устанавливаются только `tini` и `ca-certificates`, apt lists удаляются, приложение работает под `USER node`.

| Источник | Найденные HIGH/CRITICAL CVE | Обновление | Устранённые CVE | Статус |
|---|---|---|---|---|
| npm production dependencies | Нет | Не требовалось | Нет применимых | PASS — 0 vulnerabilities |
| Debian/Node production image | Не определены локально | `24.14.0-bookworm-slim` → `24.18.1-bookworm-slim` | Не заявляются без фактического Trivy scan | NOT RUN — Docker/Trivy недоступны |

Локальная среда не содержит команд `docker` и `trivy`, поэтому конкретный список CVE контейнера, table output, фактический SARIF-файл и блокирующий scan нельзя честно подтвердить до запуска `container.yml` на GitHub runner. Ни одна уязвимость не скрыта и ни одна непроверенная CVE не объявлена устранённой.

## 4. Версия и изменённые файлы

Application version согласованно обновлена `2.0.2` → `2.0.3` в `package.json`, корневой записи `package-lock.json`, UI, production metadata, тестовых ожиданиях и активной документации релиза.

Основные изменённые файлы:

- `.github/workflows/quality.yml`
- `.github/workflows/container.yml`
- `scripts/prepare-e2e-chromium.mjs`
- `scripts/validate-actions.mjs`
- `scripts/actionlint.mjs`
- `tests/prepare-e2e-chromium.test.mjs`
- `Dockerfile`
- `package.json`, `package-lock.json`
- `src/components/Header.tsx`
- production metadata в `server/` и `scripts/`
- `README.md`, `CHANGELOG.md`, `CI.md`, `CI_ACTIONS.md`, `E2E_TESTING.md`, `PRODUCTION_CHECKLIST.md`, `STAGE7_REPORT.md`, `TEST_REPORT.md`

Дополнительно исправлена воспроизводимость локального WASM actionlint: для каждого workflow создаётся отдельный экземпляр linter, поэтому все три workflow проверяются без reuse-related memory fault.

## 5. Результаты проверок

| Проверка | Результат |
|---|---|
| `npm ci` | PASS — 409 packages по lockfile |
| `npm run ci:validate` | PASS — 3 workflow, 33 action references; online tag lookup локально `SKIPPED_NETWORK_UNAVAILABLE` |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API `115/115`, frontend `12/12` |
| `npm run test:golden` | PASS — `38/38` |
| `npm run test:regression` | PASS — `35/35` |
| `npm run test:determinism` | PASS — 5 same-process + 3 separate-process, 0 mismatches |
| `npm run test:security` | PASS — `4/4` |
| `npm run build` | PASS |
| `npm run verify:template` | PASS |
| `npm run fixtures:golden` | PASS — `38/38` |
| `npm run e2e:prepare` ×2 | PASS / PASS |
| `npm run e2e:chromium` | PASS — `27/27` |
| `npm run e2e:a11y` | PASS — `2/2` |
| `npm audit --omit=dev` | PASS — 0 vulnerabilities |
| `docker build --progress=plain -t profigym-calculator:2.0.3 .` | NOT RUN — Docker CLI/daemon отсутствует |
| Trivy table scan | NOT RUN — Trivy и локальный image отсутствуют |
| Trivy SARIF generation/validation/upload | NOT RUN — выполняется в GitHub Actions после image build |
| Trivy blocking scan | NOT RUN — Trivy и локальный image отсутствуют |
| Распакованный ZIP: `npm ci`, CI validation, lint, typecheck, полный test, build, template | PASS |

Кандидат ZIP был распакован в новый временный каталог. Установка 409 пакетов по lockfile и перечисленный core-цикл выполнены именно из распакованной копии; код финального архива идентичен проверенному кандидату, после проверки изменён только этот отчёт.

## 6. Excel-шаблон

Сохранены точное Unicode-имя и идентичная production-копия:

- `public/templates/PROFiGYM_шаблон_импорта.xlsx`
- `dist/templates/PROFiGYM_шаблон_импорта.xlsx`

SHA-256 обеих копий:

```text
0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8
```

## 7. Известное ограничение и следующий обязательный шаг

Проект готов к проверке в GitHub. После загрузки необходимо запустить `quality.yml` и `container.yml`. Полный контейнерный статус может считаться PASS только после успешного Docker build, отображения Trivy table, валидации и загрузки SARIF и успешного финального `Enforce Trivy policy` на GitHub runner.
