import test from 'node:test';
import assert from 'node:assert/strict';
import { getCadImporter, registeredCadImporters } from '../server/cad/importers/index.js';

test('only the STEP importer is registered', () => {
  const importers = registeredCadImporters();
  assert.equal(importers.length, 1);
  assert.equal(importers[0].id, 'step');
  assert.deepEqual(importers[0].extensions, ['.stp', '.step']);
  assert.equal(getCadImporter('.STP').id, 'step');
  assert.throws(() => getCadImporter('.iges'), (error) => error.code === 'UNSUPPORTED_FILE_TYPE');
});
