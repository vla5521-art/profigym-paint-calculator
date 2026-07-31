import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';

const modelDir = path.resolve('test-models');
const manifest = JSON.parse(await fs.readFile(path.join(modelDir, 'manifest.json'), 'utf8'));

test.after(async () => {
  await closeCadKernel();
});

for (const expected of manifest) {
  test(`imports ${expected.name} and calculates exact B-Rep area`, async () => {
    const content = await fs.readFile(path.join(modelDir, expected.name), 'utf8');
    const result = await analyzeStepContent(content, expected.name);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics.errors));
    assert.equal(result.diagnostics.counts.bodies, 1);
    assert.ok(result.diagnostics.counts.faces > 0);
    assert.equal(result.diagnostics.faces.length, result.diagnostics.counts.faces);
    assert.ok(result.diagnostics.faces.every((face) => face.id.startsWith('face_')));
    assert.ok(Math.abs(result.diagnostics.totalArea.mm2 - expected.theoreticalAreaMm2) < 1e-6);
    assert.equal(result.diagnostics.units.normalizedTo, 'mm');
  });
}

test('returns structured diagnostics for a corrupted STEP', async () => {
  const content = await fs.readFile(path.join(modelDir, 'corrupted.step'), 'utf8');
  const result = await analyzeStepContent(content, 'corrupted.step');
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.errors[0].code, 'INVALID_STEP_FILE');
  assert.deepEqual(result.diagnostics.counts, { bodies: 0, shells: 0, faces: 0, edges: 0, vertices: 0 });
});

test('empty STEP returns a structured empty-model diagnostic', async () => {
  const content = await fs.readFile(path.join(modelDir, 'empty.step'), 'utf8');
  const result = await analyzeStepContent(content, 'empty.step');
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.errors[0].code, 'EMPTY_MODEL');
});

test('face identifiers are stable and unique for an unchanged STEP file', async () => {
  const content = await fs.readFile(path.join(modelDir, 'cube_10mm.step'), 'utf8');
  const first = await analyzeStepContent(content, 'cube_10mm.step');
  const second = await analyzeStepContent(content, 'cube_10mm.step');
  const firstIds = first.diagnostics.faces.map((face) => face.id);
  const secondIds = second.diagnostics.faces.map((face) => face.id);
  assert.deepEqual(firstIds, secondIds);
  assert.equal(new Set(firstIds).size, firstIds.length);
});

test('normalizes STEP metre coordinates to millimeters', async () => {
  const content = await fs.readFile(path.join(modelDir, 'cube_coordinates_10m.step'), 'utf8');
  const result = await analyzeStepContent(content, 'cube_coordinates_10m.step');
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.units.symbol, 'm');
  assert.equal(result.diagnostics.units.millimetersPerUnit, 1000);
  assert.equal(result.diagnostics.totalArea.mm2, 600_000_000);
  assert.equal(result.diagnostics.totalArea.m2, 600);
});

test('detects open shells and absence of bodies', async () => {
  const content = await fs.readFile(path.join(modelDir, 'open_box_shell.step'), 'utf8');
  const result = await analyzeStepContent(content, 'open_box_shell.step');
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.errors.some((issue) => issue.code === 'NO_BODIES'));
  assert.ok(result.diagnostics.errors.some((issue) => issue.code === 'OPEN_SHELLS'));
  assert.equal(result.diagnostics.validation.openShellCount, 1);
});

test('detects a valid multi-body model', async () => {
  const content = await fs.readFile(path.join(modelDir, 'two_body.step'), 'utf8');
  const result = await analyzeStepContent(content, 'two_body.step');
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.counts.bodies, 2);
  assert.equal(result.diagnostics.validation.multiBody, true);
  assert.ok(result.diagnostics.warnings.some((issue) => issue.code === 'MULTI_BODY_MODEL'));
  assert.equal(result.diagnostics.totalArea.mm2, 1200);
});
