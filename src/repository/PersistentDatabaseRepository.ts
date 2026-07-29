import type { ConsumptionNorm, Database, Document, Manufacturer, Material, Metadata, Unit } from "../types/database.ts";
import type { ImportApplyResult, ImportPlan } from "../types/import.ts";
import { IdFactory } from "../import/IdFactory.ts";
import type { DatabaseStore } from "../storage/DatabaseStore.ts";
import { IndexedDbDatabaseStore } from "../storage/IndexedDbDatabaseStore.ts";
import { parseAndValidateDatabase } from "../utils/validator.ts";
import type { DatabaseRepository } from "./DatabaseRepository.ts";
import { JsonRepository, RepositoryNotLoadedError } from "./JsonRepository.ts";
import type { WritableDatabaseRepository } from "./WritableDatabaseRepository.ts";

export class PersistentDatabaseRepository implements WritableDatabaseRepository {
  private database: Database | null = null;
  private userDatabase = false;
  private loadingPromise: Promise<void> | null = null;
  private readonly fallback: DatabaseRepository;
  private readonly store: DatabaseStore;
  public constructor(fallback: DatabaseRepository = new JsonRepository(), store: DatabaseStore = new IndexedDbDatabaseStore()) {
    this.fallback = fallback;
    this.store = store;
  }
  public async load():Promise<void>{if(this.database)return;if(this.loadingPromise)return this.loadingPromise;this.loadingPromise=this.loadInternal();try{await this.loadingPromise;}finally{this.loadingPromise=null;}}
  public async reload():Promise<void>{this.database=null;this.loadingPromise=null;await this.load();}
  public isLoaded():boolean{return this.database!==null;}
  public hasUserDatabase():boolean{return this.userDatabase;}
  public getMetadata():Metadata{return this.require().metadata;}
  public getDatabase():Readonly<Database>{return this.require();}
  public getManufacturers():Manufacturer[]{return this.require().manufacturers.filter(x=>x.is_active).slice().sort((a,b)=>a.name.localeCompare(b.name,"ru"));}
  public getManufacturer(id:string):Manufacturer|null{return this.require().manufacturers.find(x=>x.manufacturer_id===id)??null;}
  public getMaterials():Material[]{return this.require().materials.slice().sort((a,b)=>a.name.localeCompare(b.name,"ru"));}
  public getActiveMaterials():Material[]{return this.getMaterials().filter(x=>x.status==="active");}
  public getMaterialsByManufacturer(manufacturerId:string):Material[]{return this.getActiveMaterials().filter(x=>x.manufacturer_id===manufacturerId);}
  public getMaterial(materialId:string):Material|null{return this.require().materials.find(x=>x.material_id===materialId)??null;}
  public getDefaultNorm(materialId:string):ConsumptionNorm|null{return this.require().consumption_norms.find(x=>x.material_id===materialId&&x.status==="active"&&x.is_default)??null;}
  public getNormsByMaterial(materialId:string):ConsumptionNorm[]{return this.require().consumption_norms.filter(x=>x.material_id===materialId);}
  public getNorm(normId:string):ConsumptionNorm|null{return this.require().consumption_norms.find(x=>x.norm_id===normId)??null;}
  public getDocumentsByMaterial(materialId:string):Document[]{return this.require().documents.filter(x=>x.material_id===materialId);}
  public getUnit(unitId:string):Unit|null{return this.require().units.find(x=>x.unit_id===unitId)??null;}
  public async applyImportPlan(plan:ImportPlan):Promise<ImportApplyResult>{if(!plan.candidate||plan.issues.some(i=>i.severity==="error"))throw new Error("Импорт содержит критические ошибки.");const candidate=parseAndValidateDatabase(plan.candidate);const backupCreated=await this.store.replaceActiveDatabase(candidate);this.database=candidate;this.userDatabase=true;return{importBatchId:IdFactory.importBatch(plan.checksum),backupCreated,summary:plan.summary};}
  public async restoreBackup():Promise<boolean>{const restored=await this.store.restoreLatestBackup();if(restored)await this.reload();return restored;}
  public async clearUserDatabase():Promise<void>{await this.store.clear();this.database=null;this.userDatabase=false;await this.fallback.reload();await this.load();}
  public exportActiveDatabase():string{return JSON.stringify(this.require(),null,2);}
  private async loadInternal():Promise<void>{const user=await this.store.getActiveDatabase();if(user){this.database=parseAndValidateDatabase(user);this.userDatabase=true;return;}await this.fallback.load();this.database=parseAndValidateDatabase(this.fallback.getDatabase());this.userDatabase=false;}
  private require():Database{if(!this.database)throw new RepositoryNotLoadedError();return this.database;}
}
export const databaseRepository:WritableDatabaseRepository=new PersistentDatabaseRepository();
