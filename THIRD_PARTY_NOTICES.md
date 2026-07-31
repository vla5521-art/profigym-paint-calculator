# Сторонние компоненты CAD-модуля

## Three.js 0.185.x

- Назначение: интерактивный 3D-рендер подготовленных backend/OCCT mesh-данных в браузере.
- Лицензия: MIT.
- Проект: <https://threejs.org/>

## occt-wasm 3.8.1

- Назначение: Open Cascade Technology 8, скомпилированный в WebAssembly; точный B-Rep импорт STEP, обход топологии, валидация и геометрические свойства.
- JavaScript/TypeScript wrapper: `MIT OR Apache-2.0`.
- Скомпилированный WASM: `LGPL-2.1-only`, как производное Open Cascade Technology.
- Исходный проект и предложение исходного кода: <https://github.com/andymai/occt-wasm>
- Open Cascade Technology: <https://dev.opencascade.org/>
- Текст LGPL 2.1: <https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html>

`occt-wasm.wasm` устанавливается как отдельный файл зависимости и остается заменяемым. При распространении закрытого desktop-бандла необходимо отдельно проверить выполнение требований LGPL.
