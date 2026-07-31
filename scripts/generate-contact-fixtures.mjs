import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OcctKernel } from 'occt-wasm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'test-models', 'contacts');
await fs.mkdir(outputDir, { recursive: true });

const kernel = await OcctKernel.init();
const owned = new Set();

function own(shape) {
  owned.add(shape);
  return shape;
}

function box(dx, dy, dz, x = 0, y = 0, z = 0) {
  const source = own(kernel.makeBox(dx, dy, dz));
  if (x === 0 && y === 0 && z === 0) return source;
  return own(kernel.translate(source, x, y, z));
}

function cylinder(radius, height, x = 0, y = 0, z = 0) {
  const source = own(kernel.makeCylinder(radius, height));
  if (x === 0 && y === 0 && z === 0) return source;
  return own(kernel.translate(source, x, y, z));
}

function sphere(radius, x = 0, y = 0, z = 0) {
  const source = own(kernel.makeSphere(radius));
  if (x === 0 && y === 0 && z === 0) return source;
  return own(kernel.translate(source, x, y, z));
}

function compound(shapes) {
  return own(kernel.makeCompound(shapes));
}

const plateArea = 2 * (20 * 10 + 20 * 2 + 10 * 2);
const fixtures = [];

function addFixture(name, shape, expected) {
  fixtures.push({ name, shape, expected });
}

addFixture(
  'two_plates_full_contact.step',
  compound([box(20, 10, 2), box(20, 10, 2, 0, 0, 2)]),
  {
    totalAreaMm2: 2 * plateArea,
    expectedPhysicalContactAreaMm2: 200,
    expectedExcludedPaintAreaMm2: 400,
    expectedPaintableAreaMm2: 2 * plateArea - 400,
    expectedContactCount: 1,
    expectedClassifications: ['full_planar_contact'],
  },
);

addFixture(
  'two_plates_partial_overlap.step',
  compound([box(20, 10, 2), box(20, 10, 2, 10, 0, 2)]),
  {
    totalAreaMm2: 2 * plateArea,
    expectedPhysicalContactAreaMm2: 100,
    expectedExcludedPaintAreaMm2: 200,
    expectedPaintableAreaMm2: 2 * plateArea - 200,
    expectedContactCount: 1,
    expectedClassifications: ['partial_planar_contact'],
  },
);

const rod = cylinder(10, 20);
const outer = cylinder(12, 20);
const inner = cylinder(10, 20);
const tube = own(kernel.cut(outer, inner));
const cylindricalAssembly = compound([rod, tube]);
const cylinderContactArea = 2 * Math.PI * 10 * 20;
const cylindricalTotalArea = kernel.getSurfaceArea(cylindricalAssembly);
addFixture('cylindrical_fit.step', cylindricalAssembly, {
  totalAreaMm2: cylindricalTotalArea,
  expectedPhysicalContactAreaMm2: cylinderContactArea,
  expectedExcludedPaintAreaMm2: 2 * cylinderContactArea,
  expectedPaintableAreaMm2: cylindricalTotalArea - 2 * cylinderContactArea,
  expectedContactCount: 1,
  expectedClassifications: ['cylindrical_contact'],
});

addFixture(
  'tangent_contact.step',
  compound([sphere(10), sphere(10, 20, 0, 0)]),
  {
    totalAreaMm2: 8 * Math.PI * 10 ** 2,
    expectedPhysicalContactAreaMm2: 0,
    expectedExcludedPaintAreaMm2: 0,
    expectedPaintableAreaMm2: 8 * Math.PI * 10 ** 2,
    expectedContactCount: 1,
    expectedClassifications: ['tangent_contact'],
  },
);

addFixture(
  'tangent_line_contact.step',
  compound([box(10, 40, 40, -10, -20, 0), cylinder(10, 20, 10, 0, 10)]),
  {
    expectedPhysicalContactAreaMm2: 0,
    expectedExcludedPaintAreaMm2: 0,
    expectedContactCountMinimum: 1,
    expectedClassifications: ['tangent_contact'],
  },
);

addFixture(
  'small_gap_below_tolerance.step',
  compound([box(20, 10, 2), box(20, 10, 2, 0, 0, 2.02)]),
  {
    totalAreaMm2: 2 * plateArea,
    expectedPhysicalContactAreaMm2: 0,
    expectedReviewRequiredAreaMm2: 200,
    expectedExcludedPaintAreaMm2: 0,
    expectedPaintableAreaMm2: 2 * plateArea,
    expectedContactCount: 1,
    expectedClassifications: ['near_gap'],
  },
);

addFixture(
  'gap_above_tolerance.step',
  compound([box(20, 10, 2), box(20, 10, 2, 0, 0, 2.2)]),
  {
    totalAreaMm2: 2 * plateArea,
    expectedPhysicalContactAreaMm2: 0,
    expectedExcludedPaintAreaMm2: 0,
    expectedPaintableAreaMm2: 2 * plateArea,
    expectedContactCount: 0,
    expectedClassifications: [],
  },
);

addFixture(
  'multiple_contacts.step',
  compound([
    box(20, 10, 2),
    box(20, 10, 2, 0, 0, 2),
    box(20, 10, 2, 0, 0, 4),
  ]),
  {
    totalAreaMm2: 3 * plateArea,
    expectedPhysicalContactAreaMm2: 400,
    expectedExcludedPaintAreaMm2: 800,
    expectedPaintableAreaMm2: 3 * plateArea - 800,
    expectedContactCount: 2,
    expectedClassifications: ['full_planar_contact', 'full_planar_contact'],
  },
);

const separatedBodies = Array.from({ length: 10 }, (_, index) => box(10, 10, 10, index * 30, 0, 0));
addFixture('multi_body_no_contact.step', compound(separatedBodies), {
  totalAreaMm2: 10 * 600,
  expectedPhysicalContactAreaMm2: 0,
  expectedExcludedPaintAreaMm2: 0,
  expectedPaintableAreaMm2: 10 * 600,
  expectedContactCount: 0,
  expectedClassifications: [],
});

const chainBodies = Array.from({ length: 10 }, (_, index) => box(20, 10, 2, 0, 0, index * 2));
addFixture('ten_plates_chain_contacts.step', compound(chainBodies), {
  totalAreaMm2: 10 * plateArea,
  expectedPhysicalContactAreaMm2: 9 * 200,
  expectedExcludedPaintAreaMm2: 9 * 400,
  expectedPaintableAreaMm2: 10 * plateArea - 9 * 400,
  expectedContactCount: 9,
  expectedClassifications: Array.from({ length: 9 }, () => 'full_planar_contact'),
});

const manifest = [];
for (const fixture of fixtures) {
  const step = kernel.exportStep(fixture.shape);
  await fs.writeFile(path.join(outputDir, fixture.name), step, 'utf8');
  manifest.push({
    name: fixture.name,
    generatedTotalAreaMm2: kernel.getSurfaceArea(fixture.shape),
    ...fixture.expected,
  });
}
await fs.writeFile(
  path.join(outputDir, 'expected.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

for (const shape of [...owned].reverse()) kernel.release(shape);
kernel.releaseAll();
kernel[Symbol.dispose]();
console.log(JSON.stringify(manifest, null, 2));
