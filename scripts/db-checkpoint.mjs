import { cadConfig } from '../server/config.js';
import { migrateDatabase } from '../server/cad/calculations/migrations.js';
const database = migrateDatabase(cadConfig.databasePath);
let result;
try { result = database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all(); } finally { database.close(); }
console.log(JSON.stringify({ status: 'PASS', result }, null, 2));
