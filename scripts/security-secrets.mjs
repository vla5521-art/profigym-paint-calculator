import fs from 'node:fs/promises';
import path from 'node:path';
const ignored = new Set(['node_modules', '.git', 'dist', 'artifacts', '.tmp', 'playwright-report', 'test-results']);
const patterns = [
  { name: 'private-key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'github-token', regex: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'aws-access-key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'assigned-secret', regex: /(?:PROFIGYM_ACCESS_TOKEN|PROFIGYM_METRICS_TOKEN|PASSWORD|WEBHOOK_URL)\s*=\s*(?!["']?\$\{?|replace-|<|$)[^\s#]{16,}/i },
];
const assignedSecretPattern = patterns.find(({ name }) => name === 'assigned-secret').regex;
if (assignedSecretPattern.test('PROFIGYM_ACCESS_TOKEN="$access_token"')) throw new Error('secret scanner rejects safe runtime interpolation');
if (!assignedSecretPattern.test('PROFIGYM_ACCESS_TOKEN=literal-secret-value-123')) throw new Error('secret scanner does not detect literal assignments');
const findings = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (file.endsWith(path.join('scripts', 'security-secrets.mjs'))) continue;
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile() && (await fs.stat(file)).size < 2_000_000) {
      const text = await fs.readFile(file, 'utf8').catch(() => '');
      for (const pattern of patterns) if (pattern.regex.test(text)) findings.push({ file, type: pattern.name });
    }
  }
}
await walk('.');
const report = { generatedAt: new Date().toISOString(), status: findings.length ? 'FAIL' : 'PASS', findings };
await fs.mkdir('artifacts/security', { recursive: true }); await fs.writeFile('artifacts/security/secret-scan.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (findings.length) process.exitCode = 1;
