import { createApp } from './app.js';
import { cleanupStorage } from './storage.js';
import { validateProductionConfig } from './config.js';

const created = await createApp();
const { app, config, logger, calculationRepository, jobStore } = created;
const configurationErrors = validateProductionConfig(config);
if (configurationErrors.length) {
  logger.error('configuration_invalid', { errorCode: 'CONFIGURATION_INVALID', errors: configurationErrors });
  process.exit(1);
}
await cleanupStorage(config, { logger });
const cleanupTimer = setInterval(() => { cleanupStorage(config, { logger }).catch((error) => logger.error('cad_cleanup_failed', { errorCode: error.code, message: error.message, stack: error.stack })); }, config.cleanupIntervalMinutes * 60_000);
cleanupTimer.unref();
const server = app.listen(config.port, '0.0.0.0', () => logger.info('app_started', { port: config.port, processingMode: config.processingMode }));
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info('app_shutdown_started', { signal });
  clearInterval(cleanupTimer);
  server.close(() => {
    try { calculationRepository.close(); } catch (error) { logger.warn('calculation_repository_close_failed', { message: error.message }); }
    try { jobStore.close(); } catch (error) { logger.warn('job_store_close_failed', { message: error.message }); }
    logger.info('app_stopped', { signal });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 30_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
