import { cadConfig } from '../server/config.js';
import { cleanupStorage } from '../server/storage.js';

const dryRun = process.argv.includes('--dry-run');
const deleted = await cleanupStorage(cadConfig, { dryRun });
console.log(JSON.stringify({ status: 'PASS', dryRun, deleted: deleted.length, objects: deleted }, null, 2));
