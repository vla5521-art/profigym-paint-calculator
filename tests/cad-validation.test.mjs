import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCadFile } from '../src/cad/validation.ts';

test('accepts only STEP extensions', () => {
  assert.equal(validateCadFile({ name: 'part.STP', size: 10 }), null);
  assert.equal(validateCadFile({ name: 'part.step', size: 10 }), null);
  for (const name of ['part.sldprt', 'assembly.sldasm', 'part.txt', 'part.iges']) {
    assert.match(validateCadFile({ name, size: 10 }), /STEP \(\.stp, \.step\)/);
  }
});

test('rejects empty and oversized STEP files', () => {
  assert.match(validateCadFile({ name: 'part.stp', size: 0 }), /пуст/i);
  assert.match(validateCadFile({ name: 'part.stp', size: 11 }, 10), /лимит/);
});
