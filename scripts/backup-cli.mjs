import { cadConfig } from '../server/config.js';
import { cleanupBackups, createBackup, listBackups, restoreBackup, restoreBackupTest, verifyBackup } from '../server/production/backup.js';

const action = process.argv[2] || 'create';
const backupId = process.argv[3];
let result;
if (action === 'create') result = await createBackup(cadConfig);
else if (action === 'list') result = await listBackups(cadConfig);
else if (action === 'verify') result = await verifyBackup(cadConfig, backupId);
else if (action === 'restore-test') result = await restoreBackupTest(cadConfig, backupId);
else if (action === 'restore') result = await restoreBackup(cadConfig, backupId);
else if (action === 'cleanup') result = await cleanupBackups(cadConfig, Number(process.env.CAD_BACKUP_RETENTION_DAYS || 30));
else throw new Error(`Unknown backup action: ${action}`);
console.log(JSON.stringify(result, null, 2));
