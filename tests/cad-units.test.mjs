import test from 'node:test';
import assert from 'node:assert/strict';
import { areaUnits, detectStepUnits } from '../server/cad/units.js';

test('detects STEP SI units and conversion-based inches', () => {
  assert.deepEqual(
    detectStepUnits("#1=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));"),
    { source: 'mm', symbol: 'mm', millimetersPerUnit: 1, normalizedTo: 'mm' },
  );
  assert.equal(detectStepUnits("#1=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT($,.METRE.));").millimetersPerUnit, 1000);
  assert.equal(detectStepUnits("#1=CONVERSION_BASED_UNIT('INCH',#2);").millimetersPerUnit, 25.4);
});

test('converts square millimeters to cm² and m²', () => {
  assert.deepEqual(areaUnits(1_000_000), { mm2: 1_000_000, cm2: 10_000, m2: 1 });
});
