import { cadConfig } from '../server/config.js';
import { databaseStatus } from '../server/cad/calculations/migrations.js';
const status = databaseStatus(cadConfig.databasePath);
console.log(JSON.stringify({ status: status.integrity === 'ok' ? 'PASS' : 'FAIL', ...status }, null, 2));
if (status.integrity !== 'ok') process.exitCode = 1;
