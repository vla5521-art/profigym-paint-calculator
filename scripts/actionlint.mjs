import fs from 'node:fs/promises';
import path from 'node:path';
import { createLinter } from 'actionlint';

const root = process.cwd();
const workflowFiles = [
  '.github/workflows/quality.yml',
  '.github/workflows/container.yml',
  '.github/workflows/deploy.yml',
];
const linter = await createLinter();
const findings = [];

for (const relativeFile of workflowFiles) {
  const content = await fs.readFile(path.join(root, relativeFile), 'utf8');
  findings.push(...linter(content, relativeFile));
}

const report = {
  applicationVersion: '2.0.2',
  validator: 'actionlint-wasm',
  validatorPackageVersion: '2.0.6',
  generatedAt: new Date().toISOString(),
  workflows: workflowFiles,
  status: findings.length === 0 ? 'PASS' : 'FAIL',
  findings,
};
await fs.mkdir(path.join(root, 'diagnostic-reports'), { recursive: true });
await fs.writeFile(
  path.join(root, 'diagnostic-reports', 'actionlint-results.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.column}: ${finding.message} [${finding.kind}]`);
  }
  process.exitCode = 1;
} else {
  console.log(`actionlint PASS: ${workflowFiles.length} workflows`);
}
