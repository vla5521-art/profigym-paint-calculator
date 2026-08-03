# PROFiGYM Calculator v2.0.2 — Stage 7 CI Fix 2

Дата проверки: 2026-08-03  
Исходный архив: `PROFiGYM_calculator_v2.0.1_STAGE7_CI_FIXED(1).zip`  
Референс исходного GitHub-коммита, предоставленный владельцем: `1dcef161a5b8a30e802fc592420a3842245f3ed3`  
Итоговый статус: `CI_FIXED_READY_FOR_GITHUB`

## Исходные ошибки и корневые причины

### 1. Docker build: npm `ENOTEMPTY`

Падающая команда в `Dockerfile` очищала `/root/.npm` в том же `RUN`, где этот каталог подключён как BuildKit cache mount:

```dockerfile
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts && npm cache clean --force
```

`npm cache clean --force` пытался удалять содержимое живого cache mount. При конкурентном доступе BuildKit/npm это приводило к `rmdir ... ENOTEMPTY`. Ошибка не относится к production dependencies и не должна скрываться через `|| true`.

Исправленная команда:

```dockerfile
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts
```

BuildKit cache сохранён; production dependencies по-прежнему устанавливаются воспроизводимо через lockfile. Проверены обе стадии с npm cache mount: ни одна не выполняет очистку подключённого cache.

### 2. browser-e2e: неидемпотентная ffmpeg symlink

`scripts/prepare-e2e-chromium.mjs` без проверки создавал ссылку `.tmp/pw-browsers/ffmpeg-1011/ffmpeg-linux` на `/usr/bin/ffmpeg`. При повторном или параллельном запуске `symlink()` возвращал `EEXIST`, и job завершался ошибкой.

Исправленная подготовка:

- вычисляет платформенное имя Playwright ffmpeg для Linux, macOS и Windows;
- находит источник через `PLAYWRIGHT_FFMPEG_PATH`, системный Linux-путь или `PATH`;
- проверяет цель через `lstat`, `readlink` и доступность исполняемого файла;
- сохраняет существующий пригодный файл и повторно использует правильную symlink;
- удаляет только неправильную или битую symlink внутри `.tmp/pw-browsers`, не затрагивая источник и `/usr/bin`;
- не удаляет существующие объекты других типов и сообщает понятную ошибку;
- обрабатывает конкурентный `EEXIST` повторной проверкой с ограниченным числом попыток;
- публикует распакованный Chromium runtime атомарным `rename` из уникального временного каталога и принимает результат конкурентного процесса;
- выводит диагностическое сообщение о создании, повторном использовании, замене или конкурентной подготовке.

Два последовательных полных запуска `npm run e2e:prepare` завершились успешно. Второй запуск повторно использовал правильную ссылку на `/usr/bin/ffmpeg` и готовый Chromium runtime.

## Regression-тесты

Добавлен `tests/prepare-e2e-chromium.test.mjs` со следующими сценариями:

1. два последовательных запуска CLI;
2. существующий корректный ffmpeg-файл;
3. существующая корректная symlink;
4. битая symlink;
5. инъецированный конкурентный `EEXIST`;
6. шесть параллельных подготовок одной цели;
7. статическая проверка всех npm cache mounts в `Dockerfile` и production-команды `npm ci --omit=dev --ignore-scripts`.

Те же Docker-инварианты добавлены в `scripts/validate-actions.mjs`, поэтому они проверяются командой `npm run ci:validate`.

## Версия и изменённые файлы

Версия согласованно обновлена с `2.0.1` до `2.0.2` в `package.json`, корне и root package записи `package-lock.json`, UI header, server configuration/metadata, OCI label, generated reports, тестовых ожиданиях и документации. Версии алгоритмов geometry/contact/feature и бизнес-логика расчёта площади не изменялись.

Функциональные CI-исправления:

- `Dockerfile`;
- `scripts/prepare-e2e-chromium.mjs`;
- `scripts/validate-actions.mjs`;
- `tests/prepare-e2e-chromium.test.mjs`.

Версия и release metadata/documentation:

- `package.json`, `package-lock.json`;
- `src/components/Header.tsx`;
- `server/config.js`, `server/jobs.js`, `server/production/logger.js`, `server/cad/calculations/repository.js`;
- `scripts/actionlint.mjs`, `scripts/run-node-tests.mjs`, `scripts/write-unit-results.mjs`, `scripts/generate-test-report.mjs` и production/benchmark/smoke metadata scripts;
- `e2e/stage6-quality.spec.ts`, соответствующие version assertions в `tests/`, `test-models/golden/golden-manifest.json`;
- `README.md`, `CHANGELOG.md`, `CI.md`, `API.md`, `DEPLOYMENT.md`, `E2E_TESTING.md`, `PRODUCTION_CHECKLIST.md`, `TEST_REPORT.md`, `STAGE7_REPORT.md`;
- этот отчёт `STAGE7_CI_FIX2_REPORT.md`.

Рабочие возможности этапов 1–7, Docker/Compose, workflows, security, observability, backup/restore и Excel-шаблон сохранены.

## Результаты проверок рабочей копии

| Проверка | Результат | Детали |
|---|---:|---|
| `npm ci` | PASS | 409 пакетов по `package-lock.json` |
| `npm run ci:validate` | PASS | actionlint: 3 workflow; 31 action reference; online tag lookup PASS; Docker cache invariants PASS |
| `npm run lint` | PASS | ESLint без ошибок |
| `npm run typecheck` | PASS | TypeScript без ошибок |
| `npm test` | PASS | Node/API 113/113; frontend/jsdom 12/12 |
| Новые regression-тесты подготовки | PASS | 7/7, включены в Node/API 113/113 |
| `npm run test:golden` | PASS | 38/38 |
| `npm run test:regression` | PASS | 35/35 |
| `npm run test:determinism` | PASS | 5 запусков в процессе + 3 отдельных; 0 расхождений |
| `npm run test:security` | PASS | 26/26 агрегированных security/fuzz/concurrency проверок |
| `npm run build` | PASS | Vite build и postbuild template verification |
| `npm run verify:template` | PASS | обе копии XLSX идентичны |
| `npm run fixtures:golden` | PASS | 38 fixture-моделей проверены |
| `npm run e2e:chromium` | PASS | 27/27 |
| `npm run e2e:a11y` | PASS | 2/2 |
| `npm run e2e:prepare` дважды | PASS | правильные ffmpeg symlink и Chromium runtime повторно использованы |
| `docker build --progress=plain -t profigym-calculator:2.0.2 .` | NOT_RUN | Docker CLI/daemon отсутствуют в среде выполнения |
| Container production smoke | NOT_RUN | зависит от отсутствующего Docker runtime |

## Excel-шаблон

Точное имя сохранено в обеих требуемых точках:

- `public/templates/PROFiGYM_шаблон_импорта.xlsx`;
- `dist/templates/PROFiGYM_шаблон_импорта.xlsx`.

SHA-256 обеих копий:

```text
0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8
```

## Известные ограничения

- Docker build, Compose runtime и container production smoke не могли быть выполнены в текущей среде: команды `docker` нет. Их фактический запуск остаётся обязательным в GitHub Actions/на Docker-хосте.
- GitHub-hosted workflows не запускались из локального архива; workflow YAML и action references прошли локальную статическую проверку.
- Реальные regression-тесты выполнены на Linux. Пути и имена ffmpeg предусмотрены для Linux/macOS/Windows, но отдельные runners macOS и Windows локально недоступны.
- Подготовка требует пригодный системный ffmpeg или явно заданный `PLAYWRIGHT_FFMPEG_PATH`; скрипт завершится явной ошибкой, если источник отсутствует.

Ни одна обязательная проверка не отключена и не ослаблена; `|| true`, `continue-on-error` и сокрытие ошибок не добавлялись.
