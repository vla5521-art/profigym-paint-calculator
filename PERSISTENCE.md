# Постоянное хранение CAD-расчётов

Используется встроенная SQLite (`node:sqlite`) без внешнего сервера. Схема создаётся идемпотентной командой `npm run db:migrate`. Таблицы: `calculations`, `revisions`, `decision_history`, `schema_migrations`.

SQLite хранит метаданные и канонический JSON состояния. Исходный STEP и viewer mesh хранятся вне public-каталога под случайным `calculationId`. API никогда не принимает путь к файлу; ссылки проверяются на абсолютный путь и `..`.

Повторный расчёт читает сохранённый STEP, повторяет геометрию и создаёт ревизию. Ручные решения восстанавливаются только при точном совпадении стабильных ID; несовпавшие решения возвращаются предупреждениями.

Переменные: `CAD_DATABASE_PATH`, `CAD_CALCULATION_STORAGE_PATH`, `CAD_SOURCE_FILE_RETENTION_ENABLED`, `CAD_SOURCE_FILE_RETENTION_DAYS`.

При запуске repository выполняется очистка исходных STEP старше `CAD_SOURCE_FILE_RETENTION_DAYS`; при `CAD_SOURCE_FILE_RETENTION_ENABLED=false` source удаляется ближайшим циклом очистки. Метаданные, ревизии, отчёт и mesh остаются доступными, но повторный B-Rep-перерасчёт без source закономерно недоступен. Все file references дополнительно проверяются на принадлежность собственному `calculationId`; дублирование физически копирует source, mesh и preview.

Резервная копия: остановить backend и скопировать SQLite вместе со всем каталогом расчётов. Восстановление: вернуть комплект файлов и выполнить `npm run db:migrate`. Копирование одного SQLite без source/mesh не является полной резервной копией.
