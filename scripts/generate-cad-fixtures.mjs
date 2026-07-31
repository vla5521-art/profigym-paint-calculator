import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OcctKernel } from 'occt-wasm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'test-models');
await fs.mkdir(outputDir, { recursive: true });

const kernel = await OcctKernel.init();
const fixtures = [
  {
    name: 'cube_10mm.step',
    shape: kernel.makeBox(10, 10, 10),
    theoreticalAreaMm2: 600,
    formula: '6a², a=10 mm',
  },
  {
    name: 'box_10x20x30mm.step',
    shape: kernel.makeBox(10, 20, 30),
    theoreticalAreaMm2: 2200,
    formula: '2(ab+ac+bc), a=10, b=20, c=30 mm',
  },
  {
    name: 'cylinder_r10_h20mm.step',
    shape: kernel.makeCylinder(10, 20),
    theoreticalAreaMm2: 2 * Math.PI * 10 * (10 + 20),
    formula: '2πr(r+h), r=10, h=20 mm',
  },
  {
    name: 'sphere_r10mm.step',
    shape: kernel.makeSphere(10),
    theoreticalAreaMm2: 4 * Math.PI * 10 ** 2,
    formula: '4πr², r=10 mm',
  },
];

const manifest = [];
for (const fixture of fixtures) {
  const step = kernel.exportStep(fixture.shape);
  await fs.writeFile(path.join(outputDir, fixture.name), step, 'utf8');
  const actualAreaMm2 = kernel.getSurfaceArea(fixture.shape);
  manifest.push({
    name: fixture.name,
    dimensions: fixture.formula,
    theoreticalAreaMm2: fixture.theoreticalAreaMm2,
    generatedAreaMm2: actualAreaMm2,
    deviationMm2: actualAreaMm2 - fixture.theoreticalAreaMm2,
    deviationPercent: ((actualAreaMm2 - fixture.theoreticalAreaMm2) / fixture.theoreticalAreaMm2) * 100,
  });
  kernel.release(fixture.shape);
}

const cube = await fs.readFile(path.join(outputDir, 'cube_10mm.step'), 'utf8');
await fs.writeFile(path.join(outputDir, 'cube_10mm.stp'), cube, 'utf8');
await fs.writeFile(
  path.join(outputDir, 'cube_coordinates_10m.step'),
  cube.replace('SI_UNIT(.MILLI.,.METRE.)', 'SI_UNIT($,.METRE.)'),
  'utf8',
);

const shellSource = kernel.makeBox(10, 10, 10);
const shellFaces = kernel.getSubShapes(shellSource, 'face');
const openShell = kernel.sew(shellFaces.slice(0, 5));
await fs.writeFile(path.join(outputDir, 'open_box_shell.step'), kernel.exportStep(openShell), 'utf8');
for (const face of shellFaces) kernel.release(face);
kernel.release(openShell);
kernel.release(shellSource);

const bodyOne = kernel.makeBox(10, 10, 10);
const bodyTwoSource = kernel.makeBox(10, 10, 10);
const bodyTwo = kernel.translate(bodyTwoSource, 20, 0, 0);
const multiBody = kernel.makeCompound([bodyOne, bodyTwo]);
await fs.writeFile(path.join(outputDir, 'two_body.step'), kernel.exportStep(multiBody), 'utf8');
kernel.release(multiBody);
kernel.release(bodyTwo);
kernel.release(bodyTwoSource);
kernel.release(bodyOne);

await fs.writeFile(path.join(outputDir, 'corrupted.step'), 'NOT A STEP MODEL\n', 'utf8');
await fs.writeFile(
  path.join(outputDir, 'empty.step'),
  "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Empty fixture'),'2;1');\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n",
  'utf8',
);
await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

kernel.releaseAll();
kernel[Symbol.dispose]();
console.log(JSON.stringify(manifest, null, 2));
