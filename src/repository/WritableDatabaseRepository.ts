import type { Database } from "../types/database.ts";
import type { ImportApplyResult, ImportPlan } from "../types/import.ts";
import type { DatabaseRepository } from "./DatabaseRepository.ts";
export interface WritableDatabaseRepository extends DatabaseRepository {
  applyImportPlan(plan: ImportPlan): Promise<ImportApplyResult>;
  restoreBackup(): Promise<boolean>;
  clearUserDatabase(): Promise<void>;
  hasUserDatabase(): boolean;
  exportActiveDatabase(): string;
}
