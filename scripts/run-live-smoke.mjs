import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../server/app.js';
import { cadConfig } from '../server/config.js';
import { clearJobs } from '../server/jobs.js';
import { closeCadKernel } from '../server/cad/kernel.js';

const uploadDir = path.resolve('.tmp/live-smoke-uploads');
await fs.rm(uploadDir, { recursive: true, force: true });

const { app } = await createApp({
  uploadDir,
  rateLimits: {
    ...cadConfig.rateLimits,
    upload: {
      ...cadConfig.rateLimits.upload,
      limit: Math.max(cadConfig.rateLimits.upload.limit, 20),
    },
  },
});
const apiServer = app.listen(8787, '127.0.0.1');
await new Promise((resolve) => apiServer.once('listening', resolve));

const vite = await createViteServer({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  logLevel: 'warn',
});
await vite.listen();

try {
  await import('./smoke-test.mjs');
} finally {
  await vite.close();
  await new Promise((resolve) => apiServer.close(resolve));
  await closeCadKernel();
  clearJobs();
  await fs.rm(uploadDir, { recursive: true, force: true });
}
