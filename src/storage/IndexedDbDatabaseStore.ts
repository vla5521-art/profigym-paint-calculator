import type { Database } from "../types/database.ts";
import { parseAndValidateDatabase } from "../utils/validator.ts";
import type { DatabaseBackup, DatabaseStore } from "./DatabaseStore.ts";

const DB_NAME = "profigym-user-database";
const DB_VERSION = 1;
const SNAPSHOTS = "snapshots";
const ACTIVE_KEY = "active_database";
const BACKUP_PREFIX = "backup_";
const MAX_BACKUPS = 5;
interface SnapshotRecord { key: string; createdAt: string; database: Database; }
function requestResult<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error("IndexedDB request failed"));}); }
function transactionDone(transaction: IDBTransaction): Promise<void> { return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(transaction.error??new Error("IndexedDB transaction aborted"));transaction.onerror=()=>reject(transaction.error??new Error("IndexedDB transaction failed"));}); }
export class IndexedDbDatabaseStore implements DatabaseStore {
  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(SNAPSHOTS))db.createObjectStore(SNAPSHOTS,{keyPath:"key"});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error("Не удалось открыть IndexedDB."));});
  }
  public async getActiveDatabase(): Promise<Database|null> { const db=await this.open();try{const tx=db.transaction(SNAPSHOTS,"readonly");const record=await requestResult(tx.objectStore(SNAPSHOTS).get(ACTIVE_KEY) as IDBRequest<SnapshotRecord|undefined>);await transactionDone(tx);return record?parseAndValidateDatabase(record.database):null;}finally{db.close();} }
  public async replaceActiveDatabase(candidate: Database): Promise<boolean> {
    const validated=parseAndValidateDatabase(candidate);const db=await this.open();const now=new Date().toISOString();
    try{const tx=db.transaction(SNAPSHOTS,"readwrite");const store=tx.objectStore(SNAPSHOTS);const current=await requestResult(store.get(ACTIVE_KEY) as IDBRequest<SnapshotRecord|undefined>);if(current)store.put({key:`${BACKUP_PREFIX}${Date.now()}`,createdAt:now,database:current.database} satisfies SnapshotRecord);store.put({key:ACTIVE_KEY,createdAt:now,database:validated} satisfies SnapshotRecord);await transactionDone(tx);await this.trimBackups();return Boolean(current);}finally{db.close();}
  }
  public async getLatestBackup(): Promise<DatabaseBackup|null>{const backups=await this.getBackups();const latest=backups.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];return latest??null;}
  public async restoreLatestBackup(): Promise<boolean>{const latest=await this.getLatestBackup();if(!latest)return false;await this.replaceActiveDatabase(latest.database);return true;}
  public async clear(): Promise<void>{const db=await this.open();try{const tx=db.transaction(SNAPSHOTS,"readwrite");tx.objectStore(SNAPSHOTS).clear();await transactionDone(tx);}finally{db.close();}}
  private async getBackups():Promise<DatabaseBackup[]>{const db=await this.open();try{const tx=db.transaction(SNAPSHOTS,"readonly");const records=await requestResult(tx.objectStore(SNAPSHOTS).getAll() as IDBRequest<SnapshotRecord[]>);await transactionDone(tx);return records.filter(r=>r.key.startsWith(BACKUP_PREFIX)).map(r=>({backupId:r.key,createdAt:r.createdAt,database:parseAndValidateDatabase(r.database)}));}finally{db.close();}}
  private async trimBackups():Promise<void>{const backups=(await this.getBackups()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));if(backups.length<=MAX_BACKUPS)return;const db=await this.open();try{const tx=db.transaction(SNAPSHOTS,"readwrite");for(const backup of backups.slice(MAX_BACKUPS))tx.objectStore(SNAPSHOTS).delete(backup.backupId);await transactionDone(tx);}finally{db.close();}}
}
