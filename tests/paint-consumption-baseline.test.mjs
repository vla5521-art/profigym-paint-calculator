import assert from 'node:assert/strict';
import test from 'node:test';
import * as calculations from '../src/services/calculations.ts';

const { MANUAL_CONSUMPTION_NORM_CONTRACT, calculateConsumption } = calculations;

test('paint consumption baseline calculates theoretical and total consumption', () => {
  const result = calculateConsumption(10, 0.2, 1.1);
  assert.equal(result.theoreticalConsumption, 2);
  assert.equal(result.totalConsumption, 2.2);
});

test('paint consumption baseline supports fractional area and norm', () => {
  const result = calculateConsumption(2.5, 0.125, 1.15);
  assert.equal(result.theoreticalConsumption, 0.3125);
  assert.equal(result.totalConsumption, 0.359375);
});

test('paint consumption baseline keeps total equal to theoretical at loss factor 1', () => {
  const result = calculateConsumption(3.75, 0.4, 1);
  assert.equal(result.theoreticalConsumption, 1.5);
  assert.equal(result.totalConsumption, 1.5);
});

test('paint consumption baseline applies a loss factor greater than 1', () => {
  const result = calculateConsumption(8, 0.3, 1.25);
  assert.equal(result.theoreticalConsumption, 2.4);
  assert.equal(result.totalConsumption, 3);
});

test('paint consumption baseline is reproducible', () => {
  const baseline = calculateConsumption(12.345, 0.267, 1.17);
  for (let index = 0; index < 100; index += 1) {
    assert.deepEqual(calculateConsumption(12.345, 0.267, 1.17), baseline);
  }
});

test('manual norm contract fixes labels, units and fractional calculation', () => {
  assert.deepEqual(MANUAL_CONSUMPTION_NORM_CONTRACT, {
    fieldLabel: 'Норма расхода краски',
    normUnit: 'кг/м²',
    resultUnit: 'кг',
  });
  assert.deepEqual(calculateConsumption(2.5, 0.125, 1.2), {
    theoreticalConsumption: 0.3125,
    totalConsumption: 0.375,
  });
});

test('manual norm must be a positive finite number', () => {
  for (const invalidNorm of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => calculateConsumption(1, invalidNorm, 1),
      { name: 'RangeError', message: 'Норма расхода должна быть положительным числом.' },
    );
  }
});

test('manual norm calculation has one public calculation contract', () => {
  assert.deepEqual(
    Object.keys(calculations).filter((name) => name.startsWith('calculateConsumption')),
    ['calculateConsumption'],
  );
  assert.equal('calculateConsumptionWithManualNorm' in calculations, false);
});
