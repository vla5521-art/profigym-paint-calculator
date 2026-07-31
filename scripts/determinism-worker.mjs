import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';
import { root, stableResult } from './quality-utils.mjs';
const output = {};
for (const file of process.argv.slice(2)) output[file] = stableResult(await analyzeStepContent(await fs.readFile(path.join(root, 'test-models/golden', file), 'utf8'), file));
await closeCadKernel();
process.stdout.write(JSON.stringify(output));
