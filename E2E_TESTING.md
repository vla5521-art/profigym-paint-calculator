# Playwright browser E2E

Версия проекта: 2.0.2. Версия `@playwright/test`: 1.62.1. Обязательная среда — Chromium; Firefox/WebKit опциональны. Browser E2E по-прежнему использует изолированный inline test worker; production separation app/worker проверяется отдельными HTTP smoke и queue-тестами. Подготовка ffmpeg и Chromium runtime идемпотентна и безопасна при повторном или конкурентном запуске.

## Установка и запуск

```bash
npm install
npx playwright install chromium
npm run e2e:chromium
npm run e2e:a11y
```

В ограниченной Linux-среде команда `e2e:prepare` распаковывает Chromium 149 и SwiftShader из npm-пакета `@sparticuz/chromium`; `playwright.config.ts` передаёт его как `executablePath`. В обычной среде можно удалить явный `executablePath` и использовать браузер, установленный `npx playwright install chromium`.

Команды:

- `npm run e2e` — все настроенные проекты (нужны установленные Firefox/WebKit);
- `npm run e2e:chromium` — обязательный Chromium-набор;
- `npm run e2e:headed` — Chromium с окном;
- `npm run e2e:a11y` — axe и клавиатурные сценарии;
- `npm run e2e:report` — открыть HTML-report.

`webServer` автоматически запускает Vite на 4173 и CAD API на 8787. Перед стартом создаются отдельные `.tmp/e2e-runtime/{uploads,storage,reports,mesh-cache}` и чистая SQLite; локальная пользовательская БД не используется.

## WebGL

Chromium запускается с ANGLE/SwiftShader: `--enable-webgl`, `--ignore-gpu-blocklist`, `--use-gl=angle`, `--use-angle=swiftshader`, `--enable-unsafe-swiftshader`. Тест проверяет `canvas.getContext('webgl2') || canvas.getContext('webgl')` и падает при незаметном fallback. Отдельный Chromium с `--disable-webgl` проверяет доступность таблиц, решений, площадей, отчёта и CAD→ЛКМ без canvas.

На Linux software rendering может быть медленнее. На Windows/macOS штатный Playwright Chromium обычно использует доступный ANGLE/GPU backend; смысл теста не меняется. Firefox/WebKit могут отличаться доступностью headless WebGL и устанавливаются отдельно:

```bash
npx playwright install firefox webkit
npm run e2e
```

## Артефакты и диагностика

- выбранные screenshots и JSON: `artifacts/e2e/`;
- HTML-report: `playwright-report/`;
- trace, failure screenshot и video: `test-results/` (trace при retry, video только при failure).

При падении сначала открыть HTML-report, затем trace через `npx playwright show-trace <trace.zip>`. Проверить browser console, failed `/api/` requests, HTTP 500, Vite/backend log и доступность SwiftShader. Harmless warnings Node `node:sqlite experimental` и `NO_COLOR/FORCE_COLOR` не являются browser console errors.

Viewport screenshots сохраняются в `artifacts/e2e/1440/`, `1024/` и `768/`. Тесты требуют ненулевого Viewer, canvas внутри контейнера, доступных таблиц/действий и отсутствия горизонтального переполнения документа.
# Результаты browser suite

Функциональный запуск пишет `artifacts/e2e/functional-results.json`, accessibility — `artifacts/e2e/a11y-results.json`; файлы не перезаписывают друг друга. К 15 функциональным сценариям этапа 5 добавлены 12 сценариев ошибок, восстановления, regression summary, JSON/HTML отчёта, reload и нового browser page. Два a11y-сценария сохранены.
