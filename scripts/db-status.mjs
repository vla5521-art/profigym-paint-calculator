import { cadConfig } from '../server/config.js';
import { databaseStatus } from '../server/cad/calculations/migrations.js';

console.log(JSON.stringify(databaseStatus(cadConfig.databasePath), null, 2));

