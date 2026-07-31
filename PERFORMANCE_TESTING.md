# Performance testing

`npm run benchmark:full` выполняет прогрев и пять измерений классов small/medium/large. Для каждого этапа записываются min, median, p95, max, mean, standard deviation и iterations. Холодный OCCT/WASM запуск выделен отдельно. CI использует результаты как smoke-доказательство; шум общей машины не является функциональным падением.

`npm run test:memory` выполняет 20 обработок средней модели с `--expose-gc` и пишет RSS, heapUsed, external и arrayBuffers. Проверяется тренд между первой и последней группами, а не непереносимый абсолютный OS-лимит. `npm run test:soak` работает 30 секунд в CI и 5 минут локально; длительность переопределяется `SOAK_DURATION_MS`.
