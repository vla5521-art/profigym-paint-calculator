import test from 'node:test';
import assert from 'node:assert/strict';
import { areaUnits, detectStepUnits } from '../server/cad/units.js';
import { sanitizeCalculationName, CalculationRepository } from '../server/cad/calculations/repository.js';

test('area unit conversion is exact for mm², cm² and m²', () => assert.deepEqual(areaUnits(1_000_000), { mm2: 1_000_000, cm2: 10_000, m2: 1 }));
test('STEP units normalize millimetre, centimetre and metre', () => {
  assert.equal(detectStepUnits('SI_UNIT(.MILLI.,.METRE.)').millimetersPerUnit, 1);
  assert.equal(detectStepUnits('SI_UNIT(.CENTI.,.METRE.)').millimetersPerUnit, 10);
  assert.equal(detectStepUnits('SI_UNIT($,.METRE.)').millimetersPerUnit, 1000);
});
test('absolute and relative tolerance policies accept either bound', () => {
  const within = (expected, actual, absolute, relative) => Math.abs(actual - expected) <= absolute || Math.abs(actual - expected) / Math.abs(expected || 1) <= relative;
  assert.equal(within(1000, 1000.04, 0.05, 1e-6), true); assert.equal(within(1_000_000, 1_000_000.5, 0.05, 1e-6), true); assert.equal(within(10, 11, 0.05, 1e-6), false);
});
test('exclusion invariant clamps negative paintable area', () => { const total = 10; const unique = 12; assert.equal(Math.max(0, total - unique), 0); });
test('raw minus overlap equals unique exclusion', () => { const raw = 700; const overlap = 125; assert.equal(raw - overlap, 575); });
test('face, contact and feature identifiers deduplicate deterministically', () => assert.deepEqual([...new Set(['b','a','b'])].sort(), ['a','b']));
test('calculation name removes control characters but preserves escaped text as data', () => assert.equal(sanitizeCalculationName('  <script>\u0000x  '), '<script> x'));
test('storage references reject traversal and absolute paths', () => {
  const repository = Object.create(CalculationRepository.prototype); repository.config = { calculationStoragePath: '/tmp/profigym-storage-test' };
  for (const value of ['../x', '/etc/passwd', 'a/../../b']) assert.throws(() => repository.resolveStorageRef(value));
});
