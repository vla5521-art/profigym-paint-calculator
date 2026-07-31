import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../server/app.js';
import { clearJobs } from '../server/jobs.js';
import { closeCadKernel } from '../server/cad/kernel.js';

const uploadDir = path.resolve('.tmp/live-smoke-uploads');
await fs.rm(uploadDir, { recursive: true, force: true });

const { app } = await createApp({ uploadDir });
const apiServer = app.listen(8787, '127.0.0.1');
await new Promise((resolve) => apiServer.once('listening', resolve));

const vite = await createViteServer({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  logLevel: 'warn',
});
await vite.listen();

try {
  const templatePath = path.resolve('public/templates/PROFiGYM_шаблон_импорта.xlsx');
  const templateSource = await fs.readFile(templatePath);
  const templateResponse = await fetch('http://127.0.0.1:5173/templates/PROFiGYM_шаблон_импорта.xlsx');
  if (!templateResponse.ok) {
    throw new Error(`Excel template is unavailable: HTTP ${templateResponse.status}`);
  }
  const downloadedTemplate = Buffer.from(await templateResponse.arrayBuffer());
  const sourceHash = createHash('sha256').update(templateSource).digest('hex');
  const downloadedHash = createHash('sha256').update(downloadedTemplate).digest('hex');
  if (sourceHash !== downloadedHash) {
    throw new Error('Downloaded Excel template differs from public source');
  }
  console.log(JSON.stringify({
    event: 'excel_template_available',
    status: templateResponse.status,
    size: downloadedTemplate.byteLength,
    sha256: downloadedHash,
  }));

  await import('./smoke-test.mjs');
} finally {
  await vite.close();
  await new Promise((resolve) => apiServer.close(resolve));
  await closeCadKernel();
  clearJobs();
  await fs.rm(uploadDir, { recursive: true, force: true });
}
