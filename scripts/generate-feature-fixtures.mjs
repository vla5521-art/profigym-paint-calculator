import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OcctKernel } from 'occt-wasm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'test-models', 'features');
await fs.mkdir(outputDir, { recursive: true });

const kernel = await OcctKernel.init();
const owned = new Set();
const own = (shape) => {
  owned.add(shape);
  return shape;
};
const box = (dx, dy, dz, x = 0, y = 0, z = 0) => {
  const source = own(kernel.makeBox(dx, dy, dz));
  return x === 0 && y === 0 && z === 0 ? source : own(kernel.translate(source, x, y, z));
};
const cylinder = (radius, height, x = 0, y = 0, z = 0) => {
  const source = own(kernel.makeCylinder(radius, height));
  return x === 0 && y === 0 && z === 0 ? source : own(kernel.translate(source, x, y, z));
};
const cone = (r1, r2, height, x = 0, y = 0, z = 0) => {
  const source = own(kernel.makeCone(r1, r2, height));
  return x === 0 && y === 0 && z === 0 ? source : own(kernel.translate(source, x, y, z));
};
const cutAll = (base, tools) => own(kernel.cutAll(base, tools));
const compound = (shapes) => own(kernel.makeCompound(shapes));
const rotateY = (shape, angle) => own(kernel.rotate(
  shape,
  { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
  angle,
));

const fixtures = [];
function add(name, shape, expected) {
  fixtures.push({ name, shape, expected });
}

const throughArea = 2 * Math.PI * 4 * 20;
const through = cutAll(box(40, 30, 20), [cylinder(4, 30, 20, 15, -5)]);
add('through_hole.step', through, {
  expectedTypes: ['through_hole'],
  expectedFeatureCount: 1,
  expectedDiameterMm: 8,
  expectedDepthMm: 20,
  expectedRawFeatureAreaMm2: throughArea,
  expectedUniqueExcludedAreaMm2: throughArea,
  expectedStatus: 'confirmed',
});

const blind = cutAll(box(40, 30, 20), [cylinder(4, 10, 20, 15, 12)]);
const blindSideArea = 2 * Math.PI * 4 * 8;
add('blind_hole.step', blind, {
  expectedTypes: ['blind_hole'],
  expectedFeatureCount: 1,
  expectedDiameterMm: 8,
  expectedDepthMm: 8,
  expectedSideAreaMm2: blindSideArea,
  expectedBottomAreaMm2: Math.PI * 4 ** 2,
  expectedStatus: 'confirmed',
  expectedRawFeatureAreaMm2: blindSideArea,
  expectedUniqueExcludedAreaMm2: blindSideArea,
});

const stepped = cutAll(box(50, 40, 24), [
  cylinder(3, 11, 25, 20, -1),
  cylinder(5, 8, 25, 20, 9),
  cylinder(7, 8, 25, 20, 16),
]);
const steppedSideArea = 2 * Math.PI * (3 * 9 + 5 * 7 + 7 * 8);
add('stepped_hole.step', stepped, {
  expectedTypes: ['stepped_hole'],
  expectedFeatureCount: 1,
  expectedDiametersMm: [6, 10, 14],
  expectedSegmentCount: 3,
  expectedStatus: 'confirmed',
  expectedRawFeatureAreaMm2: steppedSideArea,
  expectedUniqueExcludedAreaMm2: steppedSideArea,
});

const countersunk = cutAll(box(40, 30, 20), [
  cylinder(3, 19, 20, 15, -2),
  cone(3, 7, 4, 20, 15, 17),
]);
const countersinkSideArea = 2 * Math.PI * 3 * 17 + Math.PI * (3 + 6) * Math.sqrt(3 ** 2 + 3 ** 2);
add('countersunk_hole.step', countersunk, {
  expectedTypes: ['countersunk_hole'],
  expectedFeatureCount: 1,
  expectedDiameterMm: 12,
  expectedStatus: 'confirmed',
  expectedRawFeatureAreaMm2: countersinkSideArea,
  expectedUniqueExcludedAreaMm2: countersinkSideArea,
});

const counterbored = cutAll(box(40, 30, 20), [
  cylinder(3, 17, 20, 15, -2),
  cylinder(7, 7, 20, 15, 14),
]);
const counterboreSideArea = 2 * Math.PI * (3 * 14 + 7 * 6);
add('counterbored_hole.step', counterbored, {
  expectedTypes: ['counterbored_hole'],
  expectedFeatureCount: 1,
  expectedDiametersMm: [6, 14],
  expectedSegmentCount: 2,
  expectedStatus: 'confirmed',
  expectedRawFeatureAreaMm2: counterboreSideArea,
  expectedUniqueExcludedAreaMm2: counterboreSideArea,
});

const vertical = cylinder(4, 30, 20, 15, -5);
const horizontalSource = cylinder(4, 50);
const horizontal = own(kernel.translate(rotateY(horizontalSource, Math.PI / 2), -5, 15, 10));
const intersecting = cutAll(box(40, 30, 20), [vertical, horizontal]);
add('intersecting_holes.step', intersecting, {
  expectedTypes: ['intersecting_holes', 'intersecting_holes'],
  expectedFeatureCount: 2,
  expectedStatus: 'review_required',
  expectedRawFeatureAreaMm2: 0,
  expectedUniqueExcludedAreaMm2: 0,
});

const closedCavity = cutAll(box(40, 30, 20), [box(16, 10, 8, 12, 10, 6)]);
add('closed_internal_cavity.step', closedCavity, {
  expectedTypes: ['closed_internal_cavity'],
  expectedFeatureCount: 1,
  expectedCavityAreaMm2: 2 * (16 * 10 + 16 * 8 + 10 * 8),
  expectedStatus: 'confirmed',
  expectedRawFeatureAreaMm2: 736,
  expectedUniqueExcludedAreaMm2: 736,
});

const openCavity = cutAll(box(40, 30, 20), [box(20, 14, 14, 10, 8, 10)]);
add('open_internal_cavity.step', openCavity, {
  expectedTypes: ['open_internal_cavity'],
  expectedFeatureCount: 1,
  expectedStatus: 'review_required',
  expectedRawFeatureAreaMm2: 0,
  expectedUniqueExcludedAreaMm2: 0,
});

const slotToolSource = cylinder(6, 50);
const slotTool = own(kernel.translate(rotateY(slotToolSource, Math.PI / 2), -5, 15, 20));
const slot = cutAll(box(40, 30, 20), [slotTool]);
add('slot_not_hole.step', slot, {
  expectedTypes: ['slot'],
  expectedFeatureCount: 1,
  expectedStatus: 'review_required',
  expectedRawFeatureAreaMm2: 0,
  expectedUniqueExcludedAreaMm2: 0,
});

const holedPlate = cutAll(box(40, 30, 20), [cylinder(4, 30, 20, 15, -5)]);
const fittedRod = cylinder(4, 20, 20, 15, 0);
const contactOverlap = compound([holedPlate, fittedRod]);
add('contact_and_hole_overlap.step', contactOverlap, {
  expectedTypes: ['through_hole'],
  expectedFeatureCount: 1,
  expectedContactAreaMm2: 2 * Math.PI * 4 * 20,
  expectedOverlapAreaMm2: 2 * Math.PI * 4 * 20,
  expectedRawFeatureAreaMm2: throughArea,
  expectedUniqueExcludedAreaMm2: 2 * throughArea,
});

const multiple = cutAll(box(80, 50, 30), [
  cylinder(3, 40, 15, 15, -5),
  cylinder(5, 12, 40, 15, 20),
  box(12, 10, 8, 58, 30, 10),
]);
add('multiple_features.step', multiple, {
  expectedTypes: ['blind_hole', 'closed_internal_cavity', 'through_hole'],
  expectedFeatureCount: 3,
  expectedRawFeatureAreaMm2: 2 * Math.PI * 3 * 30 + 2 * Math.PI * 5 * 10 + 592,
  expectedUniqueExcludedAreaMm2: 2 * Math.PI * 3 * 30 + 2 * Math.PI * 5 * 10 + 592,
});

const noFeatures = box(40, 30, 20);
add('no_features.step', noFeatures, {
  expectedTypes: [],
  expectedFeatureCount: 0,
  expectedStatus: null,
  expectedRawFeatureAreaMm2: 0,
  expectedUniqueExcludedAreaMm2: 0,
});

const manifest = [];
for (const fixture of fixtures) {
  await fs.writeFile(path.join(outputDir, fixture.name), kernel.exportStep(fixture.shape), 'utf8');
  manifest.push({
    name: fixture.name,
    totalAreaMm2: kernel.getSurfaceArea(fixture.shape),
    toleranceMm2: 0.05,
    ...fixture.expected,
    expectedPaintableAreaMm2: kernel.getSurfaceArea(fixture.shape) - fixture.expected.expectedUniqueExcludedAreaMm2,
  });
}
await fs.writeFile(path.join(outputDir, 'expected.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

for (const shape of [...owned].reverse()) kernel.release(shape);
kernel.releaseAll();
kernel[Symbol.dispose]();
console.log(JSON.stringify({ generated: manifest.length, outputDir }, null, 2));
