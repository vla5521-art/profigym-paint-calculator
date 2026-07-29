import type { Database } from "../types/database.ts";
export interface DatabaseBackup { backupId: string; createdAt: string; database: Database; }
export interface DatabaseStore {
  getActiveDatabase(): Promise<Database | null>;
  replaceActiveDatabase(candidate: Database): Promise<boolean>;
  getLatestBackup(): Promise<DatabaseBackup | null>;
  restoreLatestBackup(): Promise<boolean>;
  clear(): Promise<void>;
}
