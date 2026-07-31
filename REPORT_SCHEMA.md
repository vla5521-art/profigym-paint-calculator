# Отчёты CAD-расчёта

`report-schema/cad-report-1.0.0.schema.json` фиксирует обязательные поля JSON. Endpoint `report.json` включает версии, источник и SHA-256, диагностику, настройки, каноническую сводку, контакты, features, ручные исключения, решения, предупреждения и данные интеграции. Абсолютные пути, B-Rep, STEP и mesh исключены.

`report.html` — автономный печатный HTML-отчёт. Он содержит те же значения площадей, формулу, списки контактов/features и настройки. Браузерная печать позволяет сохранить его в PDF. Backend PDF в версии 1.8.0 не генерируется. При отсутствии preview отчёт создаётся с текстовой заглушкой.

Preview создаётся кнопкой Viewer и загружается multipart-запросом `POST .../preview`. Принимаются только PNG/JPEG до 2 МиБ и 4096×4096 по умолчанию; проверяются magic bytes, размер, разрешение и владение расчётом. Произвольные data URL API не принимает.

Перед формированием проверяются инварианты:

```text
paintableAreaMm2 = totalAreaMm2 - uniqueConfirmedExcludedAreaMm2
rawExcludedAreaMm2 - overlapAreaMm2 = uniqueConfirmedExcludedAreaMm2
```
