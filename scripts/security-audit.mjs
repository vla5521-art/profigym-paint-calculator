import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const child = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--omit=dev', '--audit-level=high', '--json'], { encoding: 'utf8', env: process.env });
let audit; try { audit = JSON.parse(child.stdout || '{}'); } catch { audit = { error: child.stderr || 'Invalid npm audit output' }; }
const vulnerabilities = audit.metadata?.vulnerabilities ?? {};
const blocking = Number(vulnerabilities.high ?? 0) + Number(vulnerabilities.critical ?? 0);
const report = { generatedAt: new Date().toISOString(), status: blocking === 0 && !audit.error ? 'PASS' : 'FAIL', blocking, vulnerabilities, audit };
await fs.mkdir('artifacts/security', { recursive: true }); await fs.writeFile('artifacts/security/npm-audit.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, blocking, vulnerabilities }, null, 2)); if (report.status !== 'PASS') process.exitCode = 1;
