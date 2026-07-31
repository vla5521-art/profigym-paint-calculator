import fs from 'node:fs/promises';
import path from 'node:path';
const lock = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
const rows = [];
for (const [key, value] of Object.entries(lock.packages ?? {})) {
  if (!key.startsWith('node_modules/')) continue;
  let license = value.license;
  if (!license) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(key, 'package.json'), 'utf8'));
      license = manifest.license ?? manifest.licenses?.map((entry) => typeof entry === 'string' ? entry : entry.type).filter(Boolean).join(' OR ');
    } catch { license = 'UNKNOWN'; }
  }
  rows.push({ name: key.replace(/^node_modules\//, ''), version: value.version ?? 'unknown', license: license ?? 'UNKNOWN' });
}
rows.sort((a, b) => a.name.localeCompare(b.name));
await fs.mkdir('artifacts/security', { recursive: true });
await fs.writeFile('artifacts/security/dependency-licenses.json', `${JSON.stringify({ generatedAt: new Date().toISOString(), packages: rows }, null, 2)}\n`);
const unknown = rows.filter((row) => row.license === 'UNKNOWN').length;
console.log(JSON.stringify({ status: unknown === 0 ? 'PASS' : 'PASS_WITH_REVIEW', packages: rows.length, unknown }));
