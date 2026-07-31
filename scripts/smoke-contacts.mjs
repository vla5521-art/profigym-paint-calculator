import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';

const fixtureDir = path.resolve('test-models/contacts');
const manifest = JSON.parse(await fs.readFile(path.join(fixtureDir, 'expected.json'), 'utf8'));
const checked = [];

try {
  for (const expected of manifest.filter((entry) => entry.expectedContactCount !== undefined)) {
    const content = await fs.readFile(path.join(fixtureDir, expected.name), 'utf8');
    const result = await analyzeStepContent(content, expected.name);
    assert.equal(result.ok, true, `${expected.name}: ${JSON.stringify(result.diagnostics.errors)}`);
    const contacts = result.diagnostics.contacts;
    assert.equal(contacts.contacts.length, expected.expectedContactCount, expected.name);
    assert.ok(Math.abs(contacts.summary.confirmedExcludedPaintAreaMm2 - expected.expectedExcludedPaintAreaMm2) < 1e-6, expected.name);
    assert.ok(Math.abs(contacts.summary.paintableAreaMm2 - expected.expectedPaintableAreaMm2) < 1e-6, expected.name);
    checked.push({
      name: expected.name,
      contactCount: contacts.contacts.length,
      classifications: contacts.contacts.map((contact) => contact.contactType),
      excludedPaintAreaMm2: contacts.summary.confirmedExcludedPaintAreaMm2,
      paintableAreaMm2: contacts.summary.paintableAreaMm2,
      exactCheckCount: contacts.statistics.exactCheckCount,
    });
  }
} finally {
  await closeCadKernel();
}

console.log(JSON.stringify({ status: 'ok', checked }, null, 2));
