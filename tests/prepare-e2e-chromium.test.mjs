import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ensurePlaywrightFfmpeg, resolveSystemFfmpeg } from '../scripts/prepare-e2e-chromium.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(projectRoot, 'scripts', 'prepare-e2e-chromium.mjs');
const targetFor = (root) => path.join(root, '.tmp', 'pw-browsers', 'ffmpeg-1011', 'ffmpeg-linux');

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'profigym-e2e-prepare-'));
  const source = path.join(root, 'system-ffmpeg');
  await writeFile(source, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await chmod(source, 0o755);
  return { root, source, target: targetFor(root) };
}

async function runScript(root, source) {
  const child = spawn(process.execPath, [scriptPath, '--ffmpeg-only'], {
    cwd: root,
    env: { ...process.env, PLAYWRIGHT_FFMPEG_PATH: source },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(code, 0, output);
  return output;
}

test('prepare-e2e-chromium is idempotent when run twice', async (t) => {
  const { root, source, target } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await runScript(root, source);
  const secondOutput = await runScript(root, source);
  assert.equal((await lstat(target)).isSymbolicLink(), true);
  assert.match(secondOutput, /existing symlink/u);
});

test('existing usable ffmpeg file is preserved', async (t) => {
  const { root, source, target } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const result = await ensurePlaywrightFfmpeg({ root, platform: 'linux', env: { PATH: '', PLAYWRIGHT_FFMPEG_PATH: source }, logger: () => {} });
  assert.equal(result.status, 'existing-file');
  assert.equal((await lstat(target)).isFile(), true);
});

test('existing correct ffmpeg symlink is reused', async (t) => {
  const { root, source, target } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.dirname(target), { recursive: true });
  await symlink(source, target);
  const result = await ensurePlaywrightFfmpeg({ root, platform: 'linux', env: { PATH: '', PLAYWRIGHT_FFMPEG_PATH: source }, logger: () => {} });
  assert.equal(result.status, 'existing-symlink');
  assert.equal(path.resolve(path.dirname(target), await readlink(target)), source);
});

test('broken ffmpeg symlink is replaced without touching its former source', async (t) => {
  const { root, source, target } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const missing = path.join(root, 'missing-ffmpeg');
  await mkdir(path.dirname(target), { recursive: true });
  await symlink(missing, target);
  const result = await ensurePlaywrightFfmpeg({ root, platform: 'linux', env: { PATH: '', PLAYWRIGHT_FFMPEG_PATH: source }, logger: () => {} });
  assert.equal(result.status, 'created-symlink');
  assert.equal(path.resolve(path.dirname(target), await readlink(target)), source);
  await assert.rejects(lstat(missing), { code: 'ENOENT' });
});

test('concurrent EEXIST is rechecked and accepted', async (t) => {
  const { root, source, target } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  let injected = false;
  const fsPromises = await import('node:fs/promises');
  const fsApi = {
    ...fsPromises,
    symlink: async (...args) => {
      if (!injected) {
        injected = true;
        await symlink(source, target);
        const error = new Error('simulated concurrent creation');
        error.code = 'EEXIST';
        throw error;
      }
      return symlink(...args);
    },
  };
  const result = await ensurePlaywrightFfmpeg({ root, platform: 'linux', env: { PATH: '', PLAYWRIGHT_FFMPEG_PATH: source }, fsApi, logger: () => {} });
  assert.equal(result.status, 'existing-symlink');
});

test('parallel ffmpeg preparation converges on one usable target', async (t) => {
  const { root, source, target } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(Array.from({ length: 6 }, () => ensurePlaywrightFfmpeg({ root, platform: 'linux', env: { PATH: '', PLAYWRIGHT_FFMPEG_PATH: source }, logger: () => {} })));
  assert.equal((await lstat(target)).isSymbolicLink(), true);
  assert.equal(path.resolve(path.dirname(target), await readlink(target)), source);
});

test('PLAYWRIGHT_FFMPEG_PATH takes precedence over command -v ffmpeg', async (t) => {
  const { root, source } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const discovered = path.join(bin, 'ffmpeg');
  await mkdir(bin, { recursive: true });
  await writeFile(discovered, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const result = await resolveSystemFfmpeg({ platform: 'linux', env: { PATH: bin, PLAYWRIGHT_FFMPEG_PATH: source } });
  assert.equal(result, source);
});

test('invalid PLAYWRIGHT_FFMPEG_PATH falls back to command -v ffmpeg', async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const discovered = path.join(bin, 'ffmpeg');
  await mkdir(bin, { recursive: true });
  await writeFile(discovered, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const result = await resolveSystemFfmpeg({
    platform: 'linux',
    env: { PATH: bin, PLAYWRIGHT_FFMPEG_PATH: path.join(root, 'missing-ffmpeg') },
  });
  assert.equal(result, discovered);
});

test('Dockerfile keeps npm cache mounts without cleaning the mounted cache', async () => {
  const { readFile } = await import('node:fs/promises');
  const dockerfile = await readFile(path.join(projectRoot, 'Dockerfile'), 'utf8');
  const instructions = dockerfile.replace(/\\\r?\n[ \t]*/gu, ' ').split(/\r?\n/u).filter((line) => /^RUN\s/u.test(line));
  const cacheMountRuns = instructions.filter((line) => line.includes('--mount=type=cache,target=/root/.npm'));
  assert.ok(cacheMountRuns.length >= 2, 'expected npm cache mount in build and dependencies stages');
  for (const instruction of cacheMountRuns) assert.doesNotMatch(instruction, /npm\s+cache\s+clean\s+--force/u);
  assert.ok(cacheMountRuns.some((line) => line.includes('npm ci --omit=dev --ignore-scripts')));
});
