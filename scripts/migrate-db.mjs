import { cadConfig } from '../server/config.js';
import { migrateDatabase, databaseStatus } from '../server/cad/calculations/migrations.js';

const database = migrateDatabase(cadConfig.databasePath);
database.close();
const status = databaseStatus(cadConfig.databasePath);
console.log(JSON.stringify({ ok: true, database: cadConfig.databasePath, schemaVersion: status.schemaVersion }));
