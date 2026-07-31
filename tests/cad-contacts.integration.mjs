import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OcctKernel } from 'occt-wasm';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';
import { calculateContactSummaryWithKernel } from '../server/cad/contacts/service.js';

const fixtureDir = path.resolve('test-models/contacts');
const manifest = JSON.parse(await fs.readFile(path.join(fixtureDir, 'expected.json'), 'utf8'));

async function analyze(name, options) {
  const content = await fs.readFile(path.join(fixtureDir, name), 'utf8');
  return analyzeStepContent(content, name, options);
}

function closeTo(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} ≈ ${expected}`);
}

test.after(async () => {
  await closeCadKernel();
});

for (const expected of manifest.filter((entry) => entry.expectedContactCount !== undefined)) {
  test(`real STEP contact fixture: ${expected.name}`, async () => {
    const result = await analyze(expected.name);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics.errors));
    const contactResult = result.diagnostics.contacts;
    assert.equal(contactResult.contacts.length, expected.expectedContactCount);
    assert.deepEqual(
      contactResult.contacts.map((contact) => contact.contactType).sort(),
      [...expected.expectedClassifications].sort(),
    );
    closeTo(contactResult.summary.confirmedPhysicalContactAreaMm2, expected.expectedPhysicalContactAreaMm2);
    closeTo(contactResult.summary.confirmedExcludedPaintAreaMm2, expected.expectedExcludedPaintAreaMm2);
    closeTo(contactResult.summary.paintableAreaMm2, expected.expectedPaintableAreaMm2);
    if (expected.expectedReviewRequiredAreaMm2 !== undefined) {
      closeTo(contactResult.summary.reviewRequiredPhysicalAreaMm2, expected.expectedReviewRequiredAreaMm2);
    }
  });
}

test('line tangency has zero excluded area', async () => {
  const result = await analyze('tangent_line_contact.step');
  assert.equal(result.ok, true);
  assert.ok(result.diagnostics.contacts.contacts.some((contact) => contact.contactType === 'tangent_contact'));
  assert.equal(result.diagnostics.contacts.summary.confirmedExcludedPaintAreaMm2, 0);
  assert.equal(result.diagnostics.contacts.summary.paintableAreaMm2, result.diagnostics.totalArea.mm2);
});

test('both sides are excluded exactly once across multiple independent contacts', async () => {
  const result = await analyze('multiple_contacts.step');
  assert.equal(result.diagnostics.contacts.summary.confirmedPhysicalContactAreaMm2, 400);
  assert.equal(result.diagnostics.contacts.summary.confirmedExcludedPaintAreaMm2, 800);
  assert.equal(result.diagnostics.contacts.summary.paintableAreaMm2, 760);
});

test('contact detection is deterministic with stable unique IDs', async () => {
  const first = await analyze('two_plates_partial_overlap.step');
  const second = await analyze('two_plates_partial_overlap.step');
  const firstIds = first.diagnostics.contacts.contacts.map((contact) => contact.contactId);
  const secondIds = second.diagnostics.contacts.contacts.map((contact) => contact.contactId);
  assert.deepEqual(firstIds, secondIds);
  assert.equal(new Set(firstIds).size, firstIds.length);
  assert.deepEqual(
    first.diagnostics.contacts.contacts.map(({ createdAt: _createdAt, ...contact }) => contact),
    second.diagnostics.contacts.contacts.map(({ createdAt: _createdAt, ...contact }) => contact),
  );
});

test('broad phase reduces exact checks for separated ten-body STEP', async () => {
  const result = await analyze('multi_body_no_contact.step');
  const statistics = result.diagnostics.contacts.statistics;
  assert.equal(statistics.potentialBodyPairCount, 45);
  assert.equal(statistics.broadPhaseBodyPairCount, 0);
  assert.equal(statistics.exactCheckCount, 0);
});

test('contact overflow is rejected before a negative paintable area can be produced', async () => {
  const result = await analyze('two_plates_full_contact.step');
  const kernel = await OcctKernel.init();
  try {
    assert.throws(
      () => calculateContactSummaryWithKernel(
        kernel,
        result.contactResult.contacts,
        100,
        0.01,
      ),
      (error) => error.code === 'CONTACT_AREA_OVERFLOW',
    );
  } finally {
    kernel.releaseAll();
    kernel[Symbol.dispose]();
  }
});

test('overlapping partial regions on one face are unioned and not deducted twice', async () => {
  const kernel = await OcctKernel.init();
  const first = kernel.makeRectangle(10, 10);
  const secondSource = kernel.makeRectangle(10, 10);
  const second = kernel.translate(secondSource, 5, 0, 0);
  try {
    const contacts = [
      {
        status: 'confirmed',
        patchBrep: kernel.toBREP(first),
        contactAreaMm2: 100,
        bodyAId: 'base',
        bodyBId: 'upper-a',
        faceAId: 'base-top',
        faceBId: 'upper-a-bottom',
      },
      {
        status: 'confirmed',
        patchBrep: kernel.toBREP(second),
        contactAreaMm2: 100,
        bodyAId: 'base',
        bodyBId: 'upper-b',
        faceAId: 'base-top',
        faceBId: 'upper-b-bottom',
      },
    ];
    const summary = calculateContactSummaryWithKernel(kernel, contacts, 500, 0.01);
    closeTo(summary.confirmedPhysicalContactAreaMm2, 200);
    closeTo(summary.confirmedExcludedPaintAreaMm2, 350);
    closeTo(summary.paintableAreaMm2, 150);
  } finally {
    kernel.release(first);
    kernel.release(second);
    kernel.release(secondSource);
    kernel.releaseAll();
    kernel[Symbol.dispose]();
  }
});
