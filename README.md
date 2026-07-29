# PROFiGYM — калькулятор расхода краски v1.2.0

React/TypeScript/Vite-прототип с интегрированным Repository и сохранённой концепцией дизайна версии 1.1.15.

## Локальный запуск

```bash
npm install
npm run dev
```

## Проверка и production-сборка

```bash
npm run typecheck
npm run build
npm run preview
```

## База данных

По умолчанию используется `public/data/database.json`.

Чтобы подключить другой источник, создайте `.env`:

```env
VITE_DATABASE_URL=/data/database.json
```

React-компоненты не читают JSON напрямую: доступ выполняется через `DatabaseRepository` и `useDatabase()`.

Включённая база является демонстрационной. Её нормы нельзя использовать для производственных расчётов.

## Публикация на Vercel

1. Загрузите проект в GitHub.
2. Импортируйте репозиторий в Vercel.
3. Framework Preset: Vite.
4. Build Command: `npm run build`.
5. Output Directory: `dist`.
6. Нажмите Deploy.
