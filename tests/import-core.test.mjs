import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { cleanDisplayName, normalizeName, slugify, stableHash, splitSubstrates } from '../src/import/normalization.ts';
import { IdFactory } from '../src/import/IdFactory.ts';
import { buildImportPlan } from '../src/import/DatabaseImportTransformer.ts';
import { parseAndValidateDatabase } from '../src/utils/validator.ts';
import { calculateConsumption } from '../src/services/calculations.ts';
import { PersistentDatabaseRepository } from '../src/repository/PersistentDatabaseRepository.ts';
import { MemoryDatabaseStore } from '../src/storage/MemoryDatabaseStore.ts';

async function loadDb(){ return parseAndValidateDatabase(JSON.parse(await readFile(new URL('../public/data/database.json', import.meta.url),'utf8'))); }
class StaticRepository {
  constructor(db){this.db=db;} async load(){} async reload(){} isLoaded(){return true;} getMetadata(){return this.db.metadata;} getDatabase(){return this.db;}
  getManufacturers(){return this.db.manufacturers;} getManufacturer(id){return this.db.manufacturers.find(x=>x.manufacturer_id===id)??null;}
  getMaterials(){return this.db.materials;} getActiveMaterials(){return this.db.materials.filter(x=>x.status==='active');}
  getMaterialsByManufacturer(id){return this.getActiveMaterials().filter(x=>x.manufacturer_id===id);} getMaterial(id){return this.db.materials.find(x=>x.material_id===id)??null;}
  getDefaultNorm(id){return this.db.consumption_norms.find(x=>x.material_id===id&&x.is_default&&x.status==='active')??null;}
  getNormsByMaterial(id){return this.db.consumption_norms.filter(x=>x.material_id===id);} getNorm(id){return this.db.consumption_norms.find(x=>x.norm_id===id)??null;}
  getDocumentsByMaterial(id){return this.db.documents.filter(x=>x.material_id===id);} getUnit(id){return this.db.units.find(x=>x.unit_id===id)??null;}
}
const row=(norm=0.15)=>({sourceRow:2,manufacturer:'  ООО   Тест  ',material:'Краска А',consumptionNorm:norm,substrateApplications:'металл; бетон; металл'});

test('нормализация, slug, hash и поверхности детерминированы',()=>{
  assert.equal(cleanDisplayName('  ООО\u00a0  Тест '),'ООО Тест'); assert.equal(normalizeName('ООО ТЕСТ'),'ооо тест');
  assert.equal(slugify('Краска №1'),'kraska_no1'); assert.equal(stableHash('abc'),stableHash('abc'));
  assert.deepEqual(splitSubstrates(' металл ; бетон; Металл '),['металл','бетон']);
  assert.equal(IdFactory.manufacturer('ООО Тест'),IdFactory.manufacturer('  ооо тест '));
});

test('add/update/idempotency и ссылки валидны',async()=>{
  const db=await loadDb(); const input={database:db,rows:[row()],fileName:'test.xlsx',fileSize:100,checksum:'abc',timestamp:'2026-07-29T16:00:00.000Z'};
  const first=buildImportPlan(input); assert.ok(first.candidate); assert.equal(first.summary.materialsAdded,1); assert.equal(first.summary.normsAdded,1);
  const second=buildImportPlan({...input,database:first.candidate,timestamp:'2026-07-29T17:00:00.000Z'}); assert.ok(second.candidate); assert.equal(second.summary.materialsAdded,0); assert.equal(second.summary.materialsUpdated,1);
  const materialId=IdFactory.material(IdFactory.manufacturer('ООО Тест'),'Краска А');
  assert.equal(second.candidate.materials.filter(x=>x.material_id===materialId).length,1);
  parseAndValidateDatabase(second.candidate);
});

test('конфликт норм блокирует импорт',async()=>{
  const db=await loadDb(); const plan=buildImportPlan({database:db,rows:[row(0.15),{...row(0.2),sourceRow:3}],fileName:'x.xlsx',fileSize:10,checksum:'x',timestamp:'2026-07-29T16:00:00.000Z'});
  assert.equal(plan.candidate,null); assert.equal(plan.issues[0]?.code,'conflicting_duplicate'); assert.deepEqual(plan.issues[0]?.relatedRows,[2,3]);
});

test('backup, rollback и import→reload→calculation',async()=>{
  const db=await loadDb(); const store=new MemoryDatabaseStore(); const repo=new PersistentDatabaseRepository(new StaticRepository(db),store); await repo.load();
  const plan=buildImportPlan({database:repo.getDatabase(),rows:[row(0.2)],fileName:'x.xlsx',fileSize:10,checksum:'z',timestamp:'2026-07-29T16:00:00.000Z'});
  await repo.applyImportPlan(plan); await repo.reload();
  const mfr=repo.getManufacturers().find(x=>normalizeName(x.name)==='ооо тест'); assert.ok(mfr);
  const material=repo.getMaterialsByManufacturer(mfr.manufacturer_id).find(x=>x.name==='Краска А'); assert.ok(material);
  const norm=repo.getDefaultNorm(material.material_id); assert.ok(norm); assert.equal(calculateConsumption(10,norm,1.1).totalConsumption,2.2);
  const plan2=buildImportPlan({database:repo.getDatabase(),rows:[row(0.3)],fileName:'y.xlsx',fileSize:10,checksum:'y',timestamp:'2026-07-29T17:00:00.000Z'});
  store.failNextWrite=true; await assert.rejects(()=>repo.applyImportPlan(plan2),/TEST_WRITE_FAILURE/); assert.equal(repo.getDefaultNorm(material.material_id)?.value_nominal,0.2);
  await repo.applyImportPlan(plan2); assert.equal(await repo.restoreBackup(),true); assert.equal(repo.getDefaultNorm(material.material_id)?.value_nominal,0.2);
});
