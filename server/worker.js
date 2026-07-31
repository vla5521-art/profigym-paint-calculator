import { createWorker } from './worker-runtime.js';

const worker = createWorker().start();
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  await worker.stop();
  process.exit(signal === 'SIGTERM' ? 0 : 1);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', (error) => { console.error(JSON.stringify({ event: 'worker_uncaught_exception', message: error.message })); void shutdown('uncaughtException'); });
process.on('unhandledRejection', (error) => { console.error(JSON.stringify({ event: 'worker_unhandled_rejection', message: error instanceof Error ? error.message : String(error) })); void shutdown('unhandledRejection'); });
