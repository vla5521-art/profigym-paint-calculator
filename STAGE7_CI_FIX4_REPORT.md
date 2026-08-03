# PROFiGYM calculator 2.0.4 — Stage 7 CI fix 4

Дата проверки: 2026-08-03  
Исходный GitHub commit: `54cbb98`  
Исходный пакет: `PROFiGYM_calculator_v2.0.3_STAGE7_CI_FIXED3(1).zip`  
Целевой статус локальной проверки: `CI_FIXED_READY_FOR_GITHUB`

## 1. Исходная ошибка

Workflow `quality` проходил, Docker image собирался, Trivy table и SARIF создавались и загружались. Падал только финальный блокирующий шаг `Enforce Trivy policy`, потому что Trivy находил пять исправляемых HIGH/CRITICAL уязвимостей во встроенном глобальном npm официального Node image.

Уязвимые файлы не относились к production dependencies приложения в `/app/node_modules`. Они находились в `/usr/local/lib/node_modules/npm/node_modules/`:

| CVE | Severity | Путь внутри исходного image | Installed | Fixed requirement |
|---|---|---|---:|---:|
| CVE-2026-13149 | HIGH | `/usr/local/lib/node_modules/npm/node_modules/brace-expansion/package.json` | 5.0.6 | `>= 5.0.8` в текущей major-ветке |
| CVE-2026-14257 | HIGH | `/usr/local/lib/node_modules/npm/node_modules/brace-expansion/package.json` | 5.0.6 | `>= 5.0.8` в текущей major-ветке |
| CVE-2026-59873 | CRITICAL | `/usr/local/lib/node_modules/npm/node_modules/tar/package.json` | 7.5.15 | `>= 7.5.19` |
| CVE-2026-59874 | HIGH | `/usr/local/lib/node_modules/npm/node_modules/tar/package.json` | 7.5.15 | `>= 7.5.19` |
| CVE-2026-12151 | HIGH | `/usr/local/lib/node_modules/npm/node_modules/undici/package.json` | 6.26.0 | `>= 6.27.0` в текущей major-ветке |

## 2. Корневая причина

Официальный `node:24.18.1-bookworm-slim` содержит глобальный npm. Node 24.18.1 поставляется с npm 11.17.0, но его вложенные `brace-expansion`, `tar` и `undici` в просканированном image оставались уязвимыми. Изменение `dependencies` или `overrides` приложения не может исправить пакеты по пути `/usr/local/lib/node_modules/npm/node_modules/`.

Не использовались `.trivyignore`, снижение severity, `continue-on-error`, `npm audit fix --force`, overrides приложения или ручное изменение `node_modules` вне воспроизводимого Dockerfile-шага.

## 3. Выбранное исправление

Проверены `ENTRYPOINT`, `CMD`, `HEALTHCHECK`, Compose-команды и production scripts:

- API запускается `node server/index.js`;
- worker запускается `node server/worker.js`;
- healthcheck выполняется через `node -e ...`;
- entrypoint — `/usr/bin/tini --`;
- runtime не использует `npm`, `npx`, `corepack` или `yarn`.

Поэтому выбран вариант C: npm сохранён в `build` и `dependencies` стадиях для `npm ci`, но удалён только из финальной `runtime` стадии. Вместе с ним удалены неиспользуемые corepack/yarn и CLI-ссылки. Docker build сам проверяет отсутствие глобальных package managers и работоспособность `node --version`.

| Компонент | До | После |
|---|---|---|
| Node image tag | `node:24.18.1-bookworm-slim` | `node:24.18.1-bookworm-slim` |
| Node runtime | `24.18.1` по закреплённому tag | `24.18.1` по закреплённому tag |
| npm в runtime | `11.17.0` | отсутствует |
| brace-expansion в глобальном npm | `5.0.6` | отсутствует вместе с глобальным npm |
| tar в глобальном npm | `7.5.15` | отсутствует вместе с глобальным npm |
| undici в глобальном npm | `6.26.0` | отсутствует вместе с глобальным npm |

Tag не менялся, потому что `24.18.1` — актуальный официальный Node 24 LTS patch release на дату исправления. Исправление не зависит от будущего обновления npm в base image: уязвимый глобальный toolchain вообще не попадает в production runtime.

Официальные источники: [Node 24.18.1 release](https://github.com/nodejs/node/releases/tag/v24.18.1), [Node official image](https://hub.docker.com/_/node).

## 4. Изменения CI и regression-защита

В `container.yml` после проверки локальной доступности image и до Trivy добавлен шаг `Verify npm-free production runtime`. Он:

1. выполняет `node --version` внутри финального image;
2. проверяет отсутствие `/usr/local/lib/node_modules/npm` и corepack;
3. проверяет отсутствие команд `npm`, `npx`, `corepack`, `yarn`.

Последовательность Trivy не ослаблялась: `table → SARIF → JSON/SARIF validation → upload → blocking table scan`. Финальный `Enforce Trivy policy` сохраняет `CRITICAL,HIGH`, `ignore-unfixed: true`, `vuln-type: os,library`, `exit-code: 1`.

`scripts/validate-actions.mjs` и Node regression-тест проверяют, что:

- build/dependencies stages сохраняют npm cache mounts и `npm ci`;
- runtime удаляет только глобальные package managers;
- runtime запускается напрямую через `node`;
- container workflow проверяет npm-free runtime до Trivy.

## 5. Версия и изменённые области

Версия согласованно обновлена `2.0.3 → 2.0.4` в `package.json`, корневых полях `package-lock.json`, UI, API/production metadata, reports, scripts, тестовых ожиданиях и активной release-документации. В `CHANGELOG.md` добавлен релиз 2.0.4.

Функциональные области этапов 1–7, CAD importer, расчёт площади, контакты, технологические элементы, viewer, persistence, отчёты, observability, backup/restore и Excel-шаблон не менялись.

## 6. Результаты обязательных проверок

| Проверка | Результат |
|---|---|
| `npm ci` | PASS — 409 packages |
| `npm run ci:validate` | PASS — 3 workflow, 33 action references; online action tag verification PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API 116/116, frontend 12/12 |
| `npm run test:golden` | PASS — 38/38 |
| `npm run test:regression` | PASS — 35/35 |
| `npm run test:determinism` | PASS — 5 same-process + 3 separate-process, 0 mismatches |
| `npm run test:security` | PASS — 4/4 |
| `npm run build` | PASS |
| `npm run verify:template` | PASS |
| `npm run fixtures:golden` | PASS — 38 fixtures |
| `npm run e2e:prepare`, первый запуск | PASS — ffmpeg symlink создан, Chromium опубликован атомарно |
| `npm run e2e:prepare`, второй запуск | PASS — готовые ffmpeg/Chromium повторно использованы |
| `npm run e2e:chromium` | PASS — 27/27 |
| `npm run e2e:a11y` | PASS — 2/2 |
| `npm audit --omit=dev --audit-level=high` | PASS — 0 vulnerabilities |
| `npm run prod:local:verify` | PASS — API/worker запущены отдельными процессами напрямую через Node; observability, backup/restore, rollback PASS |
| Excel source/dist SHA-256 | PASS — `0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8` |

## 7. Docker, smoke и Trivy

В текущей среде отсутствуют Docker CLI/daemon, Podman, Buildah, nerdctl и Trivy. Поэтому следующие результаты не выдаются за PASS:

| Проверка | Результат |
|---|---|
| `docker build --progress=plain -t profigym-calculator:2.0.4 .` | NOT RUN — container engine отсутствует |
| `docker run ... node --version` | NOT RUN — container engine отсутствует |
| Проверка отсутствия npm внутри image | NOT RUN локально; обязательный workflow-шаг и Docker build assertions добавлены |
| Container production smoke | NOT RUN — container engine отсутствует |
| Trivy table | NOT RUN — image/Trivy отсутствуют |
| Trivy SARIF generation | NOT RUN — image/Trivy отсутствуют |
| SARIF validation/upload | NOT RUN локально; workflow сохранён и статически валиден |
| Trivy blocking scan | NOT RUN — image/Trivy отсутствуют |

Ожидаемый результат Trivy для пяти перечисленных CVE — отсутствие findings, поскольку все три уязвимых package paths удалены из финального filesystem. Фактический итог `Total: 0 (HIGH: 0, CRITICAL: 0)` должен быть подтверждён запуском `container.yml` на GitHub runner; до этого статус проекта остаётся `CI_FIXED_READY_FOR_GITHUB`, а не `CI_FIXED_DOCKER_VERIFIED`.

## 8. Итог CVE до/после

| CVE | До | После исправления filesystem | Фактический Trivy после |
|---|---|---|---|
| CVE-2026-13149 | HIGH, brace-expansion 5.0.6 | package path отсутствует | NOT RUN локально |
| CVE-2026-14257 | HIGH, brace-expansion 5.0.6 | package path отсутствует | NOT RUN локально |
| CVE-2026-59873 | CRITICAL, tar 7.5.15 | package path отсутствует | NOT RUN локально |
| CVE-2026-59874 | HIGH, tar 7.5.15 | package path отсутствует | NOT RUN локально |
| CVE-2026-12151 | HIGH, undici 6.26.0 | package path отсутствует | NOT RUN локально |

## 9. Финальная проверка архива

ZIP распакован в новый временный каталог и проверен как независимая копия:

- `unzip -t`: PASS, CRC ошибок нет;
- один корневой каталог `PROFiGYM_calculator_v2.0.4_STAGE7_CI_FIXED4`: PASS;
- `.git`, `node_modules`, `.tmp`, Playwright runtime/report, Docker cache, SQLite-базы, `.env` и пользовательские данные: отсутствуют;
- `package.json`, `package-lock.json`, Dockerfile и три workflow: PASS;
- версия package/lock/root package: `2.0.4`;
- точное Unicode-имя обеих копий Excel-шаблона и SHA-256: PASS;
- свежий `npm ci`: PASS — 409 packages;
- `npm run ci:validate`, lint, typecheck, полный `npm test`, build и template verification из распакованной копии: PASS.
