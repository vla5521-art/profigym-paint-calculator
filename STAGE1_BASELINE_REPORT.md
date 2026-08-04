# PROFiGYM calculator — Stage 1 baseline report

## Result

Stage 1 is complete. The current PROFiGYM calculator v2.0.4 behavior is protected before the planned catalog removal. Stage 2 work was not started.

The delivery archive is named `PROFiGYM_calculator_v2.0.5_STAGE1_BASELINE.zip`. The application metadata remains `2.0.4` intentionally: this stage requested regression protection and preservation of the v2.0.4 user behavior, but did not request a production version migration.

## Implemented baseline

### Paint consumption

The existing formula is unchanged:

```text
theoreticalConsumption = area × nominal consumption norm
totalConsumption = theoreticalConsumption × loss factor
```

New unit tests protect:

- theoretical consumption;
- total consumption;
- fractional area;
- fractional norm;
- loss factor equal to 1;
- loss factor greater than 1;
- deterministic repeatability over 100 identical calculations;
- validation of a future manual norm as a positive finite number.

### Current paint calculator workflow

Frontend tests now protect:

- manual area entry;
- transfer of paintable area from CAD;
- selection of the current manufacturer, material and catalog norm;
- loss factor entry;
- calculation submission;
- rendered result and units;
- form/result clearing;
- the current return-to-saved-CAD action;
- preservation of the imported CAD area when the catalog data has not yet been selected.

The visible form was not changed. Manufacturer, material and catalog norm selection remain active.

### Future manual norm contract

A compatibility adapter was added but is not connected to the current UI. It fixes the future contract as:

- field label: `Норма расхода краски`;
- norm unit: `кг/м²`;
- result unit: `кг`;
- value: positive finite number;
- fractional values: supported;
- CAD area calculation: independent of the norm;
- norm use: paint consumption calculation only.

### CAD regression

No new CAD snapshots were needed. Existing suites already protect:

- 38 golden fixtures with total and paintable area checks;
- contact, hole, cavity, manual exclusion, overlap and unique-exclusion values;
- 35 full regression snapshots;
- five same-process and three separate-process determinism runs for five representative STEP models.

Golden manifests, fixtures, snapshots and expected values were not changed.

## Source changes

### Changed files

- `src/services/calculations.ts` — added the future manual-norm contract and compatibility adapter; the existing formula and `calculateConsumption` signature remain unchanged.
- `tests/frontend/Stage5Workflow.test.tsx` — expanded current paint/CAD workflow coverage.
- `scripts/run-live-smoke.mjs` — the local smoke harness now uses an upload limit of at least 20 so its own 11 upload-category requests can reach all assertions; production rate-limit configuration and middleware are unchanged.
- `diagnostic-reports/box_10x20x30mm.json` — refreshed by successful live smoke.
- `diagnostic-reports/corrupted.json` — refreshed by successful live smoke.
- `diagnostic-reports/cube_10mm.json` — refreshed by successful live smoke.
- `diagnostic-reports/cylinder_r10_h20mm.json` — refreshed by successful live smoke.
- `diagnostic-reports/empty.json` — refreshed by successful live smoke.
- `diagnostic-reports/node-test-results.json` — refreshed by `test:node`.
- `diagnostic-reports/open_box_shell.json` — refreshed by successful live smoke.
- `diagnostic-reports/smoke-summary.json` — refreshed by successful live smoke.
- `diagnostic-reports/sphere_r10mm.json` — refreshed by successful live smoke.
- `diagnostic-reports/two_body.json` — refreshed by successful live smoke.
- `diagnostic-reports/unit-results.json` — refreshed by `npm test`.
- `diagnostic-reports/vitest-results.json` — refreshed by frontend tests.

### Added files

- `tests/paint-consumption-baseline.test.mjs` — seven focused unit tests for the existing formula and future manual-norm contract.
- `STAGE1_BASELINE_REPORT.md` — this report.

### Explicitly unchanged

- `package.json` and `package-lock.json`;
- visible UI components and layout;
- manufacturer/material/catalog/import functionality;
- `public/data/database.json`;
- Excel import and `ExcelImportPanel`;
- `useDatabase`, repositories and IndexedDB;
- STEP importer and all CAD algorithms;
- golden fixtures, golden expected values and regression snapshots;
- CAD API, SQLite schema, Docker and Compose files;
- authentication and production security policy.

`dist` is included because the incoming release package includes it. It was rebuilt cleanly; its contents are byte-identical to the incoming v2.0.4 `dist`.

## Verification matrix

| Command | Result |
|---|---|
| `npm install` | PASS — 409 packages installed; lockfile unchanged |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — Node/API 123/123; frontend 14/14 |
| `npm run build` | PASS — production build and template postbuild verification |
| `npm run smoke:live` | PASS after the smoke-harness-only rate-limit correction |
| `npm run test:node` | PASS — 123/123 |
| `npm run test:frontend` | PASS — 14/14 |
| `npm run test:golden` | PASS — 38/38 |
| `npm run test:regression` | PASS — 35/35 snapshots |
| `npm run test:determinism` | PASS — no mismatches |
| Extracted ZIP core verification | PASS — fresh install, lint, typecheck, focused unit/frontend tests, build and template verification |

All requested command names exist in `package.json`; no script was added only for this stage.

## Encountered error and correction

The first `npm run smoke:live` reached its final rejected-format assertion with HTTP `429 RATE_LIMITED` instead of the expected `415 UNSUPPORTED_FILE_TYPE`. Root cause: the existing smoke scenario performs 11 upload-category requests while the default production upload limit is 10 per minute.

Only the local smoke harness was corrected to start its test server with an upload limit of at least 20. No production default, middleware, policy, endpoint or CAD behavior changed. The ordinary command `npm run smoke:live` then passed, including frontend, health, Excel template, valid STEP, invalid STEP and unsupported-format checks.

## Confirmations

- Paint formula: unchanged.
- Current `calculateConsumption` contract: unchanged.
- Current UI and user workflow: unchanged.
- CAD algorithms: unchanged.
- Total and paintable golden areas: unchanged.
- Golden/regression reference data: unchanged.
- Excel template SHA-256 in `public` and `dist`: `0323fb8b03c2a61911104712dc82a4bfc5bf531bf31e67a96f4b99669a9d42e8`.
- No `.env`, `.env.production`, private keys or recognizable access-token patterns are present in the delivery candidate.
- ZIP CRC, single-root structure, required files, exclusions and Unicode template paths were verified after extraction.
- Stage 2 catalog removal or manual-input UI work: not started.

## Known limitations

- Vite reports the existing warning that one CAD viewer chunk is larger than 500 kB; this is not a build failure and bundle architecture was outside Stage 1.
- npm prints an environment warning about the runner-provided `http-proxy` setting; installation and all checks succeed.

The project is ready for Stage 2.
