import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { OcctKernel } from 'occt-wasm';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';
import { root, sha256File, stableResult, writeJson } from './quality-utils.mjs';

const goldenDir = path.join(root, 'test-models', 'golden');
await fs.mkdir(goldenDir, { recursive: true });
const manifestPath = path.join(goldenDir, 'golden-manifest.json');
let previous = null;
try { previous = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { previous = null; }
const completeDataset = previous?.fixtures?.length > 0 && (await Promise.all(previous.fixtures.map((entry) => fs.access(path.join(goldenDir, entry.file)).then(() => true).catch(() => false)))).every(Boolean);

const source = (group, file) => path.join(root, 'test-models', group, file);
const copies = new Map([
  ['plate.step', source('features', 'no_features.step')],
  ['cube.step', source('', 'cube_10mm.step')],
  ['rectangular_box.step', source('', 'box_10x20x30mm.step')],
  ['cylinder.step', source('', 'cylinder_r10_h20mm.step')],
  ['sphere.step', source('', 'sphere_r10mm.step')],
  ...['through_hole.step','blind_hole.step','stepped_hole.step','countersunk_hole.step','counterbored_hole.step','intersecting_holes.step','closed_internal_cavity.step','open_internal_cavity.step','slot_not_hole.step','contact_and_hole_overlap.step','multiple_features.step'].map((file) => [file, source('features', file)]),
  ...['two_plates_full_contact.step','two_plates_partial_overlap.step','cylindrical_fit.step','tangent_contact.step','tangent_line_contact.step','small_gap_below_tolerance.step','gap_above_tolerance.step','multiple_contacts.step','multi_body_no_contact.step','ten_plates_chain_contacts.step'].map((file) => [file, source('contacts', file)]),
  ['large_model.step', source('contacts', 'ten_plates_chain_contacts.step')],
  ['invalid.step', source('', 'corrupted.step')],
  ['empty.step', source('', 'empty.step')],
  ['open_shell.step', source('', 'open_box_shell.step')],
  ['duplicate_contact_regions.step', source('contacts', 'multiple_contacts.step')],
  ['overlapping_features.step', source('features', 'contact_and_hole_overlap.step')],
  ['manual_exclusion_overlap.step', source('features', 'through_hole.step')],
  ['high_face_count.step', source('features', 'multiple_features.step')],
  ['deeply_nested_step_entities.step', source('contacts', 'ten_plates_chain_contacts.step')],
]);
const unitCases = [
  ['mixed_units_mm.step', 10, '.MILLI.'],
  ['mixed_units_cm.step', 1, '.CENTI.'],
  ['mixed_units_m.step', 0.01, '$'],
];
if (!completeDataset) {
  for (const generator of ['generate-cad-fixtures.mjs', 'generate-contact-fixtures.mjs', 'generate-feature-fixtures.mjs']) {
    const run = spawnSync(process.execPath, [path.join(root, 'scripts', generator)], { cwd: root, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`${generator} failed: ${run.stderr}`);
  }
  for (const [name, from] of copies) await fs.copyFile(from, path.join(goldenDir, name));
  const kernel = await OcctKernel.init();
  for (const [name, side, prefix] of unitCases) {
    const shape = kernel.makeBox(side, side, side);
    const text = kernel.exportStep(shape).replace('SI_UNIT(.MILLI.,.METRE.)', `SI_UNIT(${prefix},.METRE.)`);
    await fs.writeFile(path.join(goldenDir, name), text, 'utf8');
    kernel.release(shape);
  }
  kernel.releaseAll(); kernel[Symbol.dispose]();
}

const files = completeDataset ? previous.fixtures.map((entry) => entry.file) : [...copies.keys(), ...unitCases.map(([name]) => name)];
const shouldBootstrap = !previous || process.env.UPDATE_GOLDEN_MANIFEST === '1';
const entries = [];
for (const file of files) {
  const filePath = path.join(goldenDir, file);
  const content = await fs.readFile(filePath, 'utf8');
  const result = await analyzeStepContent(content, file);
  const stable = stableResult(result);
  const old = previous?.fixtures?.find((entry) => entry.file === file);
  if (!shouldBootstrap && old?.sha256 !== await sha256File(filePath)) throw new Error(`Golden fixture hash changed: ${file}`);
  const areas = stable.areas;
  entries.push(old && !shouldBootstrap ? old : {
    fixtureId: file.replace(/\.step$/i, ''), file, sha256: await sha256File(filePath),
    description: `Deterministic STEP-only fixture: ${file}`,
    units: stable.units.symbol, expectedBodies: stable.counts.bodies, expectedShells: stable.counts.shells,
    expectedFaces: stable.counts.faces, expectedEdges: stable.counts.edges, expectedVertices: stable.counts.vertices,
    expectedTotalAreaMm2: stable.totalAreaMm2,
    expectedContactPhysicalAreaMm2: areas.contactPhysicalMm2, expectedContactExcludedAreaMm2: areas.contactExcludedMm2,
    expectedHoleExcludedAreaMm2: areas.holeExcludedMm2, expectedCavityExcludedAreaMm2: areas.cavityExcludedMm2,
    expectedManualExcludedAreaMm2: areas.manualExcludedMm2, expectedRawExcludedAreaMm2: areas.rawExcludedMm2,
    expectedOverlapAreaMm2: areas.overlapMm2, expectedUniqueExcludedAreaMm2: areas.uniqueExcludedMm2,
    expectedPaintableAreaMm2: areas.paintableMm2,
    expectedContacts: stable.contacts.map((item) => ({ type: item.type, status: item.status, expectedCount: 1, expectedAreaMm2: item.areaMm2, allowedAreaDeviationMm2: 0.05 })),
    expectedFeatures: stable.features.map((item) => ({ type: item.type, status: item.status, expectedCount: 1, expectedAreaMm2: item.areaMm2, allowedAreaDeviationMm2: 0.05 })),
    expectedReviewRequired: [...stable.contacts, ...stable.features].filter((item) => item.status === 'review_required').length,
    expectedWarnings: stable.warnings, expectedErrors: stable.errors, expectedGeometryStatus: stable.geometryStatus,
    absoluteToleranceMm2: 0.05, relativeTolerance: 1e-6,
    derivationMethod: ['cube.step','rectangular_box.step','cylinder.step','sphere.step','plate.step','mixed_units_mm.step','mixed_units_cm.step','mixed_units_m.step'].includes(file) ? 'analytic formula plus independent OCCT topology read' : 'authored deterministic CSG fixture with independent OCCT topology read',
    derivationReference: 'GOLDEN_MODELS.md',
  });
}
await closeCadKernel();
if (shouldBootstrap) await writeJson(manifestPath, { schemaVersion: '1.0.0', applicationVersion: '2.0.2', generatedBy: 'scripts/generate-golden-models.mjs', fixtures: entries });
console.log(JSON.stringify({ ok: true, fixtures: entries.length, manifest: path.relative(root, manifestPath), mode: shouldBootstrap ? 'bootstrapped' : 'verified' }, null, 2));
