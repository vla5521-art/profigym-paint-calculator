import type { Database } from "../types/database.ts";
import { parseAndValidateDatabase } from "../utils/validator.ts";
import type { DatabaseBackup, DatabaseStore } from "./DatabaseStore.ts";
export class MemoryDatabaseStore implements DatabaseStore {
  private active:Database|null=null; private backups:DatabaseBackup[]=[]; public failNextWrite=false;
  public async getActiveDatabase():Promise<Database|null>{return this.active?structuredClone(this.active):null;}
  public async replaceActiveDatabase(candidate:Database):Promise<boolean>{const validated=parseAndValidateDatabase(candidate);const previous=this.active?structuredClone(this.active):null;if(this.failNextWrite){this.failNextWrite=false;throw new Error("TEST_WRITE_FAILURE");}if(previous)this.backups.push({backupId:`backup_${this.backups.length+1}`,createdAt:new Date().toISOString(),database:previous});this.active=structuredClone(validated);return previous!==null;}
  public async getLatestBackup():Promise<DatabaseBackup|null>{return this.backups.at(-1)??null;}
  public async restoreLatestBackup():Promise<boolean>{const backup=this.backups.pop();if(!backup)return false;this.active=structuredClone(backup.database);return true;}
  public async clear():Promise<void>{this.active=null;this.backups=[];}
}
