# CAD API v1.8.0

MVP принимает только STEP `.stp` и `.step`. Существующие маршруты этапов 1–3 сохранены.

Все ошибки имеют единый формат:

```json
{
  "error": {
    "code": "FEATURE_NOT_FOUND",
    "message": "Технологический элемент не найден",
    "details": null,
    "requestId": "..."
  }
}
```

## Задания и отчёты

```text
POST /api/cad/import
GET  /api/cad/job/{jobId}
GET  /api/cad/report/{jobId}
```

`POST` принимает multipart-поле `file`, возвращает HTTP 202. Результаты доступны после статуса `completed`.

Viewer mesh задания:

```text
GET /api/cad/report/{jobId}/viewer-mesh
```

Ответ содержит только сериализуемые positions/normals/indices, метаданные граней и контактные patches; B-Rep и STEP в браузер не передаются.

## Сохранённые расчёты этапа 5

```text
POST   /api/cad/calculations
GET    /api/cad/calculations
GET    /api/cad/calculations/{calculationId}
PATCH  /api/cad/calculations/{calculationId}
DELETE /api/cad/calculations/{calculationId}
POST   /api/cad/calculations/{calculationId}/duplicate
POST   /api/cad/calculations/{calculationId}/recalculate
GET    /api/cad/calculations/{calculationId}/revisions
GET    /api/cad/calculations/{calculationId}/viewer-mesh
```

Создание принимает `{ "jobId": "...", "name": "..." }`. Список поддерживает `page`, `pageSize`, `search`, `status`, `sort=updated_desc|updated_asc|created_desc|created_asc` и не возвращает mesh.

Повторный расчёт принимает `contactSettings`, `featureRules`, `preserveManualDecisions`, `preserveReviewDecisions`. Он читает сохранённый STEP, создаёт ревизию и явно сообщает о несовпавших решениях кодом предупреждения `DECISION_RESTORE_CONFLICT`.

## Решения, отчёты и ЛКМ

```text
POST   /api/cad/calculations/{calculationId}/decisions/bulk
POST   /api/cad/calculations/{calculationId}/features/manual
DELETE /api/cad/calculations/{calculationId}/features/{featureId}
GET    /api/cad/calculations/{calculationId}/report.json
GET    /api/cad/calculations/{calculationId}/report.html
GET    /api/cad/calculations/report-schema.json
POST   /api/cad/calculations/{calculationId}/integrate-paint
POST   /api/cad/calculations/{calculationId}/preview
GET    /api/cad/calculations/{calculationId}/preview
```

`preview` принимает только multipart-поле `preview` с фактическим PNG/JPEG. MIME определяется по magic bytes; размер и разрешение ограничены конфигурацией. Файл хранится только в каталоге своего расчёта и встраивается в печатный HTML.

`integrate-paint` требует `{ "confirmed": true }`, завершённый расчёт и положительный `paintableAreaMm2`. Возвращаются `paintableAreaMm2`, `paintableAreaM2`, `calculationId`, имя STEP, дата и версия алгоритма. `review_required` не блокирует передачу, но возвращается предупреждение.

## Контакты этапа 3

```text
GET  /api/cad/report/{jobId}/contacts
POST /api/cad/report/{jobId}/contacts/{contactId}/confirm
POST /api/cad/report/{jobId}/contacts/{contactId}/reject
POST /api/cad/report/{jobId}/contacts/{contactId}/reset
```

Форма ответа и правила решений этапа 3 сохранены. После решения также пересчитывается общая сводка этапа 4.

## Технологические элементы

```text
GET  /api/cad/report/{jobId}/features
POST /api/cad/report/{jobId}/features/{featureId}/confirm
POST /api/cad/report/{jobId}/features/{featureId}/reject
POST /api/cad/report/{jobId}/features/{featureId}/reset
```

`GET` возвращает:

- `features` — детерминированный список распознанных и ручных элементов;
- `summary` — общую сводку контактов и features;
- `statistics` — фактическое время стадий распознавания.

Ручное решение устанавливает `manually_confirmed` или `manually_rejected`. `reset` удаляет ручное решение и повторно применяет правила задания.

## Ручное исключение

```http
POST /api/cad/report/{jobId}/features/manual
Content-Type: application/json

{"faceIds":["face_...","face_..."]}
```

Ответ HTTP 201 содержит обновлённый feature result. Пустой список, неизвестная грань и полный дубль существующего feature отклоняются.

```text
DELETE /api/cad/report/{jobId}/features/{featureId}
```

Удалять можно только `manual_feature`.

## Правила задания

```text
GET   /api/cad/report/{jobId}/feature-rules
PATCH /api/cad/report/{jobId}/feature-rules
```

PATCH принимает любое подмножество:

```json
{
  "holeMinDiameterMm": 1,
  "holeMaxDiameterMm": 50,
  "holeMinDepthMm": 1,
  "holeMaxDepthMm": 100,
  "excludeThrough": true,
  "excludeBlind": true,
  "excludeBottomFace": false,
  "excludeCountersink": true,
  "excludeCounterbore": true,
  "excludeClosedCavity": true
}
```

Правила изолированы внутри задания. Изменение повторно классифицирует сохранённые элементы и немедленно пересчитывает площадь без повторной загрузки STEP.

## Сводка

Основные числовые поля выдаются без внутреннего промежуточного округления и дублируются объектами в мм², см² и м²:

```text
totalAreaMm2
confirmedPhysicalContactAreaMm2
confirmedContactExcludedAreaMm2
confirmedHoleExcludedAreaMm2
confirmedCavityExcludedAreaMm2
confirmedManualExcludedAreaMm2
reviewRequiredFeatureAreaMm2
rawContactExcludedAreaMm2
rawFeatureExcludedAreaMm2
rawExcludedAreaMm2
overlapAreaMm2
uniqueConfirmedExcludedAreaMm2
paintableAreaMm2
```

## Ошибки

| Код | HTTP | Значение |
|---|---:|---|
| `CONTACT_NOT_FOUND` | 404 | Контакт не найден |
| `INVALID_CONTACT_DECISION` | 409 | Недопустимое решение по контакту |
| `FEATURE_NOT_FOUND` | 404 | Feature не найден |
| `INVALID_FEATURE_DECISION` | 409 | Недопустимое решение или удаление |
| `INVALID_FEATURE_RULES` | 400 | Невалидные правила |
| `INVALID_FACE_SELECTION` | 400 | Пустые или неизвестные face ID |
| `MANUAL_FEATURE_CONFLICT` | 409 | Полный дубль feature |
| `FEATURE_GEOMETRY_FAILED` | 422 | Ошибка B-Rep-распознавания |
| `FEATURE_AREA_OVERFLOW` | 422 | Исключение превышает полную площадь |
| `FEATURE_OVERLAP_FAILED` | 422 | Ошибка объединения B-Rep-исключений |
| `JOB_NOT_COMPLETED` | 409 | Задание не завершено |
| `CALCULATION_NOT_FOUND` | 404 | Расчёт/принадлежащий ему файл не найден |
| `CALCULATION_RECALCULATION_FAILED` | 422 | Перерасчёт из сохранённого STEP не выполнен |
| `VIEWER_MESH_NOT_READY` | 409 | Mesh отсутствует или недоступна |
| `VIEWER_MESH_TOO_LARGE` | 409 | Лимит сетки превышен после огрубления |
| `DECISION_RESTORE_CONFLICT` | предупреждение | Старое решение не сопоставлено молча |
| `INVALID_REPORT_PREVIEW` | 400 | Preview не является допустимым PNG/JPEG |
| `PAINT_INTEGRATION_CONFIRMATION_REQUIRED` | 409 | Нет явного подтверждения передачи |
# API версии приложения 2.0.4

Форматы импорта не изменились: только `.stp` и `.step`; неподдерживаемые расширения возвращают HTTP 415. Версии приложения и алгоритмов передаются раздельно: `applicationVersion=2.0.4`, geometry `2.0.0`, contact `3.0.0`, feature `4.0.0`.

## Production endpoints

- `POST /api/auth/login` обменивает `PROFIGYM_ACCESS_TOKEN` на HttpOnly SameSite session cookie; CLI может использовать `Authorization: Bearer`.
- `GET /health/live`, `/health/ready`, `/health/startup` доступны без токена и не раскрывают пути или секреты.
- `GET /metrics` отдаёт Prometheus exposition и защищён отдельным metrics token.
- `DELETE /api/cad/jobs/:id` отменяет queued job либо ставит cooperative cancellation flag для processing job.
- Все `/api/cad/*` endpoints защищены auth, rate limits, CORS allowlist и request/correlation ID.
