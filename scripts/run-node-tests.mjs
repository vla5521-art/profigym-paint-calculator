import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { reportsDir, root, writeJson } from './quality-utils.mjs';

const entries = await fs.readdir(path.join(root, 'tests'));
const testFiles = entries
  .filter((name) => /\.(test|integration)\.mjs$/.test(name))
  .sort()
  .map((name) => path.join('tests', name));

// OCCT/WASM integration files each start a real backend and can compile the same
// large module on a cold runner. Run files serially to avoid memory pressure and
// connection resets while preserving concurrency tests in their dedicated suite.
const child = spawn(process.execPath, ['--experimental-strip-types', '--test', '--test-concurrency=1', ...testFiles], {
  cwd: root,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
child.stderr.on('data', (chunk) => {
  output += chunk;
  process.stderr.write(chunk);
});

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});
const number = (label) => Number(output.match(new RegExp(`(?:ℹ|#) ${label} (\\d+)`))?.[1] ?? 0);
await writeJson(path.join(reportsDir, 'node-test-results.json'), {
  schemaVersion: '1.0.0',
  applicationVersion: '2.0.3',
  generatedAt: new Date().toISOString(),
  files: testFiles.length,
  tests: number('tests'),
  passed: number('pass'),
  failed: number('fail'),
  skipped: number('skipped'),
  exitCode,
  status: exitCode === 0 ? 'PASS' : 'FAIL',
});
process.exitCode = exitCode;
