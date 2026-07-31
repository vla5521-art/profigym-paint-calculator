import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const root = process.cwd();
const workflowFiles = [
  '.github/workflows/quality.yml',
  '.github/workflows/container.yml',
  '.github/workflows/deploy.yml',
];
const verifiedAt = '2026-07-31';
const actionPolicy = new Map([
  ['actions/checkout', { version: 'v7', source: 'https://github.com/actions/checkout/releases/tag/v7.0.1', inputs: new Set() }],
  ['actions/setup-node', { version: 'v6', source: 'https://github.com/actions/setup-node/releases/tag/v6.5.0', inputs: new Set(['node-version', 'cache']) }],
  ['actions/upload-artifact', { version: 'v7', source: 'https://github.com/actions/upload-artifact/releases/tag/v7.0.1', inputs: new Set(['name', 'path', 'if-no-files-found', 'retention-days']) }],
  ['docker/setup-buildx-action', { version: 'v4', source: 'https://github.com/docker/setup-buildx-action/releases/tag/v4.2.0', inputs: new Set() }],
  ['docker/login-action', { version: 'v4', source: 'https://github.com/docker/login-action/releases/tag/v4.6.0', inputs: new Set(['registry', 'username', 'password']) }],
  ['docker/metadata-action', { version: 'v6', source: 'https://github.com/docker/metadata-action/releases/tag/v6.2.0', inputs: new Set(['images', 'tags']) }],
  ['docker/build-push-action', { version: 'v7', source: 'https://github.com/docker/build-push-action/releases/tag/v7.3.0', inputs: new Set(['context', 'push', 'load', 'tags', 'labels', 'build-args', 'provenance', 'sbom', 'cache-from', 'cache-to']) }],
  ['aquasecurity/trivy-action', { version: 'v0.36.0', source: 'https://github.com/aquasecurity/trivy-action/releases/tag/v0.36.0', inputs: new Set(['scan-type', 'image-ref', 'format', 'output', 'severity', 'exit-code', 'ignore-unfixed', 'vuln-type', 'limit-severities-for-sarif']) }],
  ['github/codeql-action/upload-sarif', { version: 'v4', source: 'https://github.com/github/codeql-action/releases/tag/v4.37.4', inputs: new Set(['sarif_file', 'category']) }],
]);

const failures = [];
const warnings = [];
const references = [];
const documents = new Map();
const forbiddenTrivyReference = ['aquasecurity/trivy-action@', '0.30.0'].join('');
const fail = (message) => failures.push(message);

for (const relativeFile of workflowFiles) {
  const absoluteFile = path.join(root, relativeFile);
  const content = await fs.readFile(absoluteFile, 'utf8');
  if (content.includes(forbiddenTrivyReference)) fail(`${relativeFile}: forbidden Trivy reference remains`);
  if (content.includes('fromJSON(steps.meta.outputs.json).tags[0]')) fail(`${relativeFile}: fragile metadata JSON tag selection remains`);
  let document;
  try { document = parse(content); } catch (error) { fail(`${relativeFile}: YAML parse failed: ${error.message}`); continue; }
  documents.set(relativeFile, { content, document });

  for (const [jobName, job] of Object.entries(document.jobs ?? {})) {
    for (const [index, step] of (job.steps ?? []).entries()) {
      if (step.run) {
        const syntax = spawnSync('bash', ['-n'], { input: String(step.run), encoding: 'utf8' });
        if (syntax.status !== 0) fail(`${relativeFile}:${jobName}: step ${index + 1} shell syntax: ${syntax.stderr.trim()}`);
      }
      if (!step.uses || String(step.uses).startsWith('./')) continue;
      const match = String(step.uses).match(/^([^@]+)@(.+)$/u);
      if (!match) { fail(`${relativeFile}:${jobName}: invalid action reference ${step.uses}`); continue; }
      const [, action, version] = match;
      const policy = actionPolicy.get(action);
      if (!policy) { fail(`${relativeFile}:${jobName}: unapproved external action ${action}`); continue; }
      if (version !== policy.version) fail(`${relativeFile}:${jobName}: ${action}@${version}, expected ${policy.version}`);
      const inputKeys = Object.keys(step.with ?? {});
      for (const input of inputKeys) if (!policy.inputs.has(input)) fail(`${relativeFile}:${jobName}: unsupported audited input ${action}.${input}`);
      if (action === 'actions/upload-artifact' && step.with?.['if-no-files-found'] === undefined) {
        fail(`${relativeFile}:${jobName}: upload-artifact must define if-no-files-found`);
      }
      references.push({ file: relativeFile, job: jobName, action, version, inputs: inputKeys });
    }
  }
}

for (const relativeFile of ['scripts/deploy-vps.sh', 'scripts/rollback-vps.sh']) {
  const syntax = spawnSync('bash', ['-n', path.join(root, relativeFile)], { encoding: 'utf8' });
  if (syntax.status !== 0) fail(`${relativeFile}: shell syntax: ${syntax.stderr.trim()}`);
}

for (const action of actionPolicy.keys()) {
  if (!references.some((reference) => reference.action === action)) fail(`required audited action is not used: ${action}`);
}

const container = documents.get('.github/workflows/container.yml')?.document;
const containerText = documents.get('.github/workflows/container.yml')?.content ?? '';
const containerPermissions = container?.permissions ?? {};
for (const permission of ['contents', 'packages', 'security-events']) {
  if (!containerPermissions[permission]) fail(`container.yml: missing ${permission} permission`);
}
if ('id-token' in containerPermissions) fail('container.yml: id-token permission is not required');
if (!containerText.includes('steps.image.outputs.ref')) fail('container.yml: single image reference output is not used');
if (!containerText.includes('docker pull "$IMAGE_REF"')) fail('container.yml: pushed image is not explicitly pulled before local smoke');
if (!containerText.includes('load: ${{ github.event_name == \'pull_request\' }}')) fail('container.yml: pull-request build must load the image locally');
if (!containerText.includes('push: ${{ github.event_name != \'pull_request\' }}')) fail('container.yml: fork-safe push condition is missing');
if (!containerText.includes('limit-severities-for-sarif: true')) fail('container.yml: SARIF severity gating is not explicit');

const deploy = documents.get('.github/workflows/deploy.yml')?.document;
const deployTriggers = Object.keys(deploy?.on ?? {});
if (deployTriggers.length !== 1 || deployTriggers[0] !== 'workflow_dispatch') fail('deploy.yml: deploy must be workflow_dispatch-only');
if (!deploy?.jobs?.preflight || !deploy?.jobs?.deploy?.environment) fail('deploy.yml: secret preflight or GitHub Environment is missing');

const smokeText = await fs.readFile(path.join(root, 'scripts/production-smoke.mjs'), 'utf8');
if (/import\(['"]\.\.\/server\//u.test(smokeText) || /from ['"]\.\.\/server\//u.test(smokeText)) {
  fail('production-smoke.mjs: internal application modules are forbidden; smoke must use HTTP only');
}

for (const composeFile of ['compose.yml', 'compose.production.yml']) {
  const text = (await fs.readFile(path.join(root, composeFile), 'utf8')).replace(/!override[ \t]*/gu, '');
  try { parse(text); } catch (error) { fail(`${composeFile}: YAML parse failed: ${error.message}`); }
}
const compose = parse(await fs.readFile(path.join(root, 'compose.yml'), 'utf8'));
for (const service of ['volume-init', 'proxy', 'app', 'worker']) if (!compose.services?.[service]) fail(`compose.yml: service ${service} is missing`);
if (compose.services?.app?.image !== compose.services?.worker?.image) fail('compose.yml: app and worker must use the same image reference');
if (JSON.stringify(compose.services?.app?.command) === JSON.stringify(compose.services?.worker?.command)) fail('compose.yml: app and worker commands must differ');
if (!String(compose.services?.app?.image).includes('PROFIGYM_IMAGE')) fail('compose.yml: PROFIGYM_IMAGE interpolation is missing');
if (!JSON.stringify(compose.services?.backup?.command ?? '').includes('scripts/backup-cli.mjs create')) fail('compose.yml: backup service must execute the packaged backup CLI');
const nginxLocal = await fs.readFile(path.join(root, 'nginx/local.conf'), 'utf8');
const nginxProduction = await fs.readFile(path.join(root, 'nginx/production.conf'), 'utf8');
if (!nginxLocal.includes('proxy_pass http://app:8787') || !nginxProduction.includes('proxy_pass http://app:8787')) fail('nginx: proxy upstream must target app:8787');

let networkStatus = 'SKIPPED_NETWORK_UNAVAILABLE';
const onlineFailures = [];
try {
  const results = await Promise.all([...actionPolicy].map(async ([action, policy]) => {
    const repository = action.split('/').slice(0, 2).join('/');
    const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(policy.version)}`, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        'user-agent': 'profigym-ci-validator',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) onlineFailures.push(`${action}@${policy.version}: HTTP ${response.status}`);
    return response.ok;
  }));
  networkStatus = results.every(Boolean) ? 'PASS' : 'FAIL';
} catch (error) {
  warnings.push(`online action-tag verification unavailable: ${error.message}`);
  if (process.env.GITHUB_ACTIONS === 'true' || process.env.CI_ACTIONS_REQUIRE_NETWORK === '1') {
    fail(`online action-tag verification is required in CI: ${error.message}`);
  }
}
for (const issue of onlineFailures) fail(`missing action tag: ${issue}`);

const actionsDoc = await fs.readFile(path.join(root, 'CI_ACTIONS.md'), 'utf8');
if (!actionsDoc.includes(`lastVerifiedAt | ${verifiedAt}`)) fail('CI_ACTIONS.md: lastVerifiedAt is missing or stale');
for (const [action, policy] of actionPolicy) {
  if (!actionsDoc.includes(`| ${action} | ${policy.version} |`)) fail(`CI_ACTIONS.md: undocumented ${action}@${policy.version}`);
}

const actionlint = JSON.parse(await fs.readFile(path.join(root, 'diagnostic-reports/actionlint-results.json'), 'utf8'));
if (actionlint.status !== 'PASS') fail('actionlint result is not PASS');
const report = {
  applicationVersion: '2.0.1',
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  actionlint: actionlint.status,
  workflowFiles,
  actionReferences: references,
  actionTagVerification: networkStatus,
  onlineFailures,
  composeStaticValidation: failures.some((message) => message.startsWith('compose') || message.startsWith('nginx')) ? 'FAIL' : 'PASS',
  failures,
  warnings,
};
await fs.mkdir(path.join(root, 'diagnostic-reports'), { recursive: true });
await fs.writeFile(path.join(root, 'diagnostic-reports/ci-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`CI validation PASS: ${workflowFiles.length} workflows, ${references.length} action references`);
  console.log(`Action tag verification: ${networkStatus}`);
}
