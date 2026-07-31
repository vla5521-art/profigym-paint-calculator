# STAGE4_REPORT — PROFiGYM 1.7.0

Дата проверки: 2026-07-31.

## Итог

Этап 4 реализован непосредственно в проекте версии 1.6.0 из архива `PROFiGYM_calculator_v1.6.0_STAGE3_CONTACTS_TEMPLATE_FIXED(1).zip`. Приложение не создавалось заново. STEP-импорт и narrow phase контактов этапа 3 не заменялись и не упрощались.

Версия и корневая папка:

```text
1.7.0
PROFiGYM_calculator_v1.7.0_STAGE4_FEATURES
```

## Архитектура

```text
STEP importer
  → normalized OCCT B-Rep
  → Stage 3 contact detection
  → B-Rep feature candidate extraction
  → hole/cavity recognition
  → per-job rule engine
  → exclusion union by source face
  → manual decisions
  → final paintable area
```

Новый модуль:

- `server/cad/features/config.js` — переменные окружения, проверка и объединение правил;
- `candidates.js` — B-Rep-грани, оболочки, рёбра, UV, ориентации, площади и смежность;
- `grouping.js` — оси, углы, расстояния и связные компоненты;
- `hole-recognizer.js` — отверстия, ступени, зенковки, цековки, пересечения и пазы;
- `cavity-recognizer.js` — закрытые и открытые полости;
- `rules.js` — технологическое решение после распознавания;
- `exclusions.js` — единое объединение контактов/features/manual;
- `service.js` — оркестрация, публичные DTO, повторная классификация и ручные features.

## Реально поддержанные типы

Реальными STEP-тестами подтверждены:

- `through_hole`;
- `blind_hole`;
- `stepped_hole` — три соосных участка;
- `countersunk_hole` — цилиндр и коническая грань;
- `counterbored_hole` — два цилиндрических диаметра и кольцевой переход;
- `intersecting_holes` — два взаимно перпендикулярных отверстия с отдельными ID;
- `closed_internal_cavity`;
- `open_internal_cavity`;
- `slot` как отрицательный пример;
- `manual_feature` через API и frontend.

Автоматически подтверждаются однозначные простые/ступенчатые/зенкованные/цекованные отверстия и закрытые внутренние полости, если они проходят правила задания.

Всегда требуют проверки:

- пересекающиеся отверстия;
- открытые внутренние полости;
- пазы и неполные цилиндрические контуры;
- распознавание ниже порога уверенности;
- случаи при выключенном автоматическом исключении.

## B-Rep-признаки

Внутренняя цилиндрическая грань отличается от наружной одновременно по:

- OCCT surface type;
- обратной B-Rep-ориентации `reversed`;
- замкнутому UV-периоду;
- радиусу;
- восстановленной оси;
- топологической смежности;
- открывающим круговым рёбрам;
- связанному дну или переходам.

Наружный эталонный цилиндр имеет `forward` и не распознаётся как отверстие. Неполный цилиндрический контур эталонного паза получает `slot`.

## Правила по умолчанию

| Переменная | Значение |
|---|---:|
| `CAD_FEATURE_AUTO_EXCLUDE_ENABLED` | `true` |
| `CAD_HOLE_MIN_DIAMETER_MM` | `0.5` |
| `CAD_HOLE_MAX_DIAMETER_MM` | `1000` |
| `CAD_HOLE_MIN_DEPTH_MM` | `0.5` |
| `CAD_HOLE_MAX_DEPTH_MM` | `1000` |
| `CAD_HOLE_EXCLUDE_THROUGH` | `true` |
| `CAD_HOLE_EXCLUDE_BLIND` | `true` |
| `CAD_HOLE_EXCLUDE_BOTTOM_FACE` | `false` |
| `CAD_COUNTERSINK_EXCLUDE` | `true` |
| `CAD_COUNTERBORE_EXCLUDE` | `true` |
| `CAD_CLOSED_CAVITY_EXCLUDE` | `true` |
| `CAD_OPEN_CAVITY_REVIEW_REQUIRED` | `true` |
| `CAD_FEATURE_CONFIDENCE_THRESHOLD` | `0.9` |
| `CAD_FEATURE_AREA_TOLERANCE_MM2` | `0.01` |
| `CAD_FEATURE_AXIS_TOLERANCE_MM` | `0.05` |
| `CAD_FEATURE_ANGLE_TOLERANCE_DEG` | `1` |

Дно и плоские переходы хранятся в feature, но по умолчанию не исключаются. Изменение правила `excludeBottomFace` немедленно включает их площадь.

## STEP-фикстуры и эталонные площади

Все модели воспроизводимо создаются `scripts/generate-feature-fixtures.mjs`. Полный машиночитаемый эталон — `test-models/features/expected.json`, допуск `0.05 мм²`.

| Модель | Features | Полная, мм² | Уникально исключено, мм² | Окрашиваемая, мм² |
|---|---:|---:|---:|---:|
| `through_hole.step` | 1 | 5602.123860 | 502.654825 | 5099.469035 |
| `blind_hole.step` | 1 | 5401.061930 | 201.061930 | 5200.000000 |
| `stepped_hole.step` | 1 | 9004.867198 | 741.415866 | 8263.451332 |
| `countersunk_hole.step` | 1 | 5499.028621 | 440.400290 | 5058.628331 |
| `counterbored_hole.step` | 1 | 5671.238898 | 527.787566 | 5143.451332 |
| `intersecting_holes.step` | 2 review | 6250.902544 | 0 | 6250.902544 |
| `closed_internal_cavity.step` | 1 | 5936.000000 | 736.000000 | 5200.000000 |
| `open_internal_cavity.step` | 1 review | 5880.000000 | 0 | 5880.000000 |
| `slot_not_hole.step` | 1 review | 5360.884901 | 0 | 5360.884901 |
| `contact_and_hole_overlap.step` | 1 + contact | 6205.309649 | 1005.309649 | 5200.000000 |
| `multiple_features.step` | 3 | 17215.097275 | 1471.645943 | 15743.451332 |
| `no_features.step` | 0 | 5200.000000 | 0 | 5200.000000 |

У `blind_hole.step` площадь дна `50.265482 мм²` сохранена отдельно, но не входит в исключение по умолчанию.

## Предотвращение двойного вычитания

Итог не является суммой всех площадей. Исключения объединяются по исходному `faceId`:

1. полная грань подтверждённого feature/manual занимает всю грань;
2. контактные B-Rep-патчи одной грани объединяются OCCT;
3. если feature уже исключает грань, контактный патч этой грани второй раз не учитывается.

Для `contact_and_hole_overlap.step`:

```text
raw contact excluded = 1005.309649149 мм²
raw feature excluded = 502.654824574 мм²
raw excluded         = 1507.964473723 мм²
overlap              = 502.654824574 мм²
unique excluded      = 1005.309649149 мм²
paintable            = 5200.000000000 мм²
```

Тем самым внутренняя поверхность отверстия, одновременно являющаяся цилиндрическим контактом, вычитается один раз.

## API и ручные решения

Добавлены:

```text
GET    /api/cad/report/{jobId}/features
POST   /api/cad/report/{jobId}/features/{featureId}/confirm
POST   /api/cad/report/{jobId}/features/{featureId}/reject
POST   /api/cad/report/{jobId}/features/{featureId}/reset
POST   /api/cad/report/{jobId}/features/manual
DELETE /api/cad/report/{jobId}/features/{featureId}
GET    /api/cad/report/{jobId}/feature-rules
PATCH  /api/cad/report/{jobId}/feature-rules
```

Правила, ручные решения и B-Rep-каталог граней хранятся внутри задания. PATCH повторно применяет rule engine без повторного чтения STEP.

## Frontend

Добавлены восемь карточек итоговой площади, таблица features, решения confirm/reject/reset, панель правил, выбор строк граней, создание и удаление `manual_feature`. После любого действия frontend получает пересчитанный результат без повторной загрузки STEP.

## Тесты

Первичный полный прогон на финальном коде:

```text
Node/API/B-Rep: 83/83
Frontend:        9/9
Всего:          92/92
lint:           успешно
typecheck:      успешно
```

Тесты используют реальные STEP-файлы и реальные OCCT-операции. Дополнительно проверены регрессии контактов, STEP-импорта, отклонение `.sldprt`/`.sldasm`/`.asm`, Excel-шаблон и production-копия.

## Smoke и benchmark

`npm run smoke:features` успешно проверил шесть сценариев: простое, ступенчатое, несколько features, пересекающиеся отверстия, отсутствие features и перекрытие контакта с отверстием.

Фактический benchmark Node 24.14.0:

| Модель | STEP import, мс | Feature pipeline, мс | Total measured, мс | Candidates | Confirmed | Review |
|---|---:|---:|---:|---:|---:|---:|
| through | 174.202 | 8.582 | 202.797 | 1 | 1 | 0 |
| stepped | 10.550 | 3.834 | 24.514 | 1 | 1 | 0 |
| multiple | 15.478 | 12.052 | 39.747 | 3 | 3 | 0 |
| intersecting | 21.229 | 5.130 | 43.988 | 2 | 0 | 2 |
| no features | 6.725 | 2.088 | 14.654 | 0 | 0 | 0 |
| contact overlap | 12.605 | 4.384 | 99.486 | 1 | 1 | 0 |

Первый запуск включает инициализацию WASM: прирост RSS `298958848` байт. На последующих сценариях измеренный прирост составил `262144…38141952` байт. Это RSS до/после сценария, а не инструментальный peak. Искусственный порог успеха не применялся. Полный JSON: `diagnostic-reports/features-benchmark.json`.

## Unicode Excel-шаблон

Сохраняются точные пути:

```text
public/templates/PROFiGYM_шаблон_импорта.xlsx
dist/templates/PROFiGYM_шаблон_импорта.xlsx
```

SHA-256 обеих копий:

```text
0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8
```

Тест проверяет корректность XLSX, точное Unicode-имя, отсутствие `PROFiGYM_#U*.xlsx` и идентичность production-копии.

## Регрессии этапов 1–3

- Изменений narrow phase, аналитических эталонов и допусков этапа 3 не потребовалось.
- Ручное решение по контакту теперь дополнительно запускает общий пересчёт Stage 4; собственный ответ contact API и расчёт обеих сторон сохранены.
- STEP-only загрузка, диагностика этапа 2 и коды повреждённого/пустого STEP сохранены.
- Все прежние тесты этапов 1–3 прошли.

## Известные ограничения

- Распознавание подтверждено только на перечисленных STEP-фикстурах.
- Резьбы, произвольные NURBS-каналы, литейные лабиринты и деформируемые элементы не поддержаны.
- Пересекающиеся отверстия сохраняются отдельно, но автоматически не исключаются.
- Открытая полость не считается недоступной без ручного решения.
- Технологическая доступность конкретного распылителя, кисти или окрасочной линии не моделируется.
- Паз определяется по неполному цилиндрическому контуру; произвольные профильные пазы могут попасть в `ambiguous_feature` или не быть выделены.
- Данные заданий и ручные решения находятся в памяти процесса.
- 3D-визуализация и интерактивный выбор на модели относятся к этапу 5.

## Созданные и изменённые файлы

Созданы модуль `server/cad/features/`, 12 STEP-файлов и `expected.json`, генератор, feature smoke/benchmark, B-Rep/API/frontend-тесты, `FEATURE_ALGORITHM.md` и этот отчёт.

Изменены интеграционные точки `server/cad/kernel.js`, `processor.js`, `app.js`, `jobs.js`, `config.js`, frontend API/компонент/стили, package metadata, `.env.example`, README, CHANGELOG и API-документация.
