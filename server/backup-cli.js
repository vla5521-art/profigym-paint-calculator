import { cadConfig } from './config.js';
import { createBackup } from './production/backup.js';
console.log(JSON.stringify(await createBackup(cadConfig), null, 2));
