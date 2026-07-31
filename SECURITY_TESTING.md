# Security testing

`npm run test:security` отправляет реальные HTTP multipart/JSON запросы. Проверяются расширения и MIME, двойные расширения, homoglyph, path traversal, границы размера, ZIP/HTML/JS/EXE/XLSX/binary spoofing, malformed UUID, oversized JSON, неверные типы и prototype-pollution keys. Загруженные STEP не распаковываются. Ошибки возвращают единый объект без stack trace; временные файлы проверяются после отказа.

Тестовые ZIP-подобные payload безопасны: это короткие заголовки/metadata, не многогигабайтные архивы.
