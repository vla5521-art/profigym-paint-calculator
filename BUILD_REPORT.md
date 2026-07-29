# PROFiGYM 1.3.0 — отчёт проверки

Дата: 2026-07-29

## Результаты команд

| Команда | Код | Результат |
|---|---:|---|
| `npm ci` | 1 | Не выполнено: внутренний npm registry вернул 404 для `@types/react`. |
| `npm run typecheck` | 0 | Успешно. |
| `npm test` | 0 | Успешно: 9/9 тестов. |
| `npm run build` | 2 | Не выполнено: после неудачного `npm ci` отсутствуют локальные `vite` и `@vitejs/plugin-react`. |
| `npm run preview` | 127 | Не выполнено: `vite` отсутствует. |

## Проверено успешно

- миграция 1.1→1.2;
- неизменность существующих ID;
- служебные записи схемы 1.2;
- нормализация, slug и стабильный hash;
- add/update/idempotency;
- конфликт разных норм;
- backup и rollback через контракт хранилища;
- import→reload→calculation;
- структура XLSX-шаблона;
- TypeScript typecheck;
- `allowImportingTsExtensions=true` используется вместе с `noEmit=true`.

## Статус релиза

Архив **не подтверждён как готовый к деплою**, поскольку обязательные `npm ci`, production build и preview smoke-test не удалось выполнить в текущей среде из-за недоступности зависимостей во внутреннем npm registry.
