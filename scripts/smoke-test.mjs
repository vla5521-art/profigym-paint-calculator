import fs from 'node:fs/promises';
import path from 'node:path';

const frontendBase = process.env.SMOKE_FRONTEND_URL || 'http://127.0.0.1:5173';
const apiBase = process.env.SMOKE_API_URL || 'http://127.0.0.1:8787';
const reportDir = path.resolve('diagnostic-reports');
await fs.mkdir(reportDir, { recursive: true });

async function waitForTerminal(id) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await fetch(`${apiBase}/api/cad/job/${id}`);
    if (!response.ok) throw new Error(`Status endpoint returned ${response.status}`);
    const job = (await response.json()).job;
    if (job.status === 'completed' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Job ${id} timed out`);
}

async function uploadModel(file, expectedStatus = 'completed') {
  const bytes = await fs.readFile(path.resolve('test-models', file));
  const form = new FormData();
  form.append('file', new Blob([bytes]), file);
  const upload = await fetch(`${apiBase}/api/cad/import`, { method: 'POST', body: form });
  if (upload.status !== 202) throw new Error(`${file}: upload returned ${upload.status}`);
  const created = await upload.json();
  const job = await waitForTerminal(created.job.id);
  if (job.status !== expectedStatus) throw new Error(`${file}: expected ${expectedStatus}, received ${job.status}: ${JSON.stringify(job.error)}`);
  const reportResponse = await fetch(`${apiBase}/api/cad/report/${job.id}`);
  const report = (await reportResponse.json()).report;
  await fs.writeFile(path.join(reportDir, `${path.parse(file).name}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return {
    file,
    status: job.status,
    areaMm2: job.area?.mm2 ?? 0,
    bodies: job.diagnostics?.counts.bodies ?? 0,
    faces: job.diagnostics?.counts.faces ?? 0,
    performance: job.performance,
    errorCodes: job.diagnostics?.errors.map((issue) => issue.code) ?? [],
  };
}

async function expectRejectedUpload(name, expectedCode) {
  const form = new FormData();
  form.append('file', new Blob(['unsupported']), name);
  const response = await fetch(`${apiBase}/api/cad/import`, { method: 'POST', body: form });
  const payload = await response.json();
  if (response.status !== 415 || payload.error?.code !== expectedCode) {
    throw new Error(`${name}: expected 415/${expectedCode}, received ${response.status}/${payload.error?.code}`);
  }
  return { file: name, status: response.status, errorCode: payload.error.code };
}

const frontendResponse = await fetch(frontendBase);
const frontendHtml = await frontendResponse.text();
if (!frontendResponse.ok || !frontendHtml.includes('id="root"')) throw new Error('Frontend smoke check failed');
const health = await fetch(`${apiBase}/api/health`);
if (!health.ok) throw new Error('Backend health check failed');

const results = [];
for (const file of ['cube_10mm.stp', 'box_10x20x30mm.step', 'cylinder_r10_h20mm.step', 'sphere_r10mm.step', 'two_body.step']) {
  results.push(await uploadModel(file));
}
results.push(await uploadModel('open_box_shell.step', 'failed'));
results.push(await uploadModel('corrupted.step', 'failed'));
results.push(await uploadModel('empty.step', 'failed'));
const rejectedFormats = [];
for (const name of ['part.sldprt', 'assembly.sldasm', 'notes.txt']) {
  rejectedFormats.push(await expectRejectedUpload(name, 'UNSUPPORTED_FILE_TYPE'));
}

const summary = {
  checkedAt: new Date().toISOString(),
  frontend: { url: frontendBase, status: frontendResponse.status, rootFound: true },
  backend: { url: apiBase, status: health.status },
  results,
  rejectedFormats,
};
await fs.writeFile(path.join(reportDir, 'smoke-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
