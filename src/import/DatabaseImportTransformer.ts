import type { Database, Document, Manufacturer, Material, Substrate } from "../types/database.ts";
import type { ImportIssue, ImportPlan, ImportSummary, RawImportRow } from "../types/import.ts";
import { SUBSTRATE_UNSPECIFIED_ID, USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID } from "../utils/migration.ts";
import { parseAndValidateDatabase } from "../utils/validator.ts";
import { IdFactory } from "./IdFactory.ts";
import { cleanDisplayName, normalizeName, splitSubstrates } from "./normalization.ts";
const DEFAULT_CATEGORY_ID = "cat_coating"; const DEFAULT_UNIT_ID = "unit_kg_m2"; const DEFAULT_METHOD_ID = "method_manual";
const emptySummary = (rowsTotal:number): ImportSummary => ({rowsTotal,rowsAccepted:0,manufacturersAdded:0,materialsAdded:0,materialsUpdated:0,substratesAdded:0,normsAdded:0,normsUpdated:0,duplicatesSkipped:0});
const conflictIssue = (rows:number[], manufacturer:string, material:string): ImportIssue => ({code:"conflicting_duplicate",severity:"error",message:`Для «${manufacturer} — ${material}» указаны разные нормы расхода.`,row:rows[0]??null,column:"consumptionNorm",relatedRows:rows});
export interface BuildImportPlanInput { database: Database; rows: RawImportRow[]; fileName:string; fileSize:number; checksum:string; timestamp:string; }
export function buildImportPlan(input: BuildImportPlanInput): ImportPlan {
  const summary=emptySummary(input.rows.length); const issues:ImportIssue[]=[]; const unique=new Map<string,RawImportRow>(); const rowGroups=new Map<string,RawImportRow[]>();
  for(const row of input.rows){const key=`${normalizeName(row.manufacturer)}|${normalizeName(row.material)}`; const group=rowGroups.get(key)??[]; group.push(row); rowGroups.set(key,group);}
  for(const group of rowGroups.values()){
    const norms=new Set(group.map(r=>r.consumptionNorm));
    if(norms.size>1){issues.push(conflictIssue(group.map(r=>r.sourceRow),group[0]?.manufacturer??"",group[0]?.material??""));continue;}
    unique.set(`${normalizeName(group[0]?.manufacturer??"")}|${normalizeName(group[0]?.material??"")}`,group[0]!); summary.duplicatesSkipped += Math.max(0,group.length-1);
  }
  if(issues.some(i=>i.severity==="error")) return {candidate:null,issues,summary,checksum:input.checksum,fileName:input.fileName,fileSize:input.fileSize};
  const db=structuredClone(input.database); const mfrByName=new Map(db.manufacturers.map(x=>[normalizeName(x.name),x]));
  const matByKey=new Map(db.materials.map(x=>[`${x.manufacturer_id}|${normalizeName(x.name)}`,x])); const subByName=new Map(db.substrates.map(x=>[normalizeName(x.name),x]));
  const batchId=IdFactory.importBatch(input.checksum);
  for(const row of unique.values()){
    const mfrName=cleanDisplayName(row.manufacturer); let manufacturer=mfrByName.get(normalizeName(mfrName));
    if(!manufacturer){manufacturer={manufacturer_id:IdFactory.manufacturer(mfrName),name:mfrName,country:null,website_url:null,is_active:true} satisfies Manufacturer; db.manufacturers.push(manufacturer);mfrByName.set(normalizeName(mfrName),manufacturer);summary.manufacturersAdded++;}
    const materialName=cleanDisplayName(row.material); const materialKey=`${manufacturer.manufacturer_id}|${normalizeName(materialName)}`; let material=matByKey.get(materialKey); const isNew=!material;
    if(!material){material={material_id:IdFactory.material(manufacturer.manufacturer_id,materialName),name:materialName,manufacturer_id:manufacturer.manufacturer_id,category_id:DEFAULT_CATEGORY_ID,manufacturer_product_code:null,description:null,technology_id:null,components_count:null,density_kg_l:null,volume_solids_pct:null,mix_ratio_base:null,mix_ratio_hardener:null,mix_ratio_unit:null,pot_life_min:null,shelf_life_months:null,color:null,gloss_id:null,min_temp_c:null,max_temp_c:null,status:"active",is_user_material:true,created_at:input.timestamp,updated_at:input.timestamp,record_version:1,introduced_in_version:"1.3.0",retired_in_version:null,verified_at:null,notes:"Добавлено из пользовательского Excel."} satisfies Material;db.materials.push(material);matByKey.set(materialKey,material);summary.materialsAdded++;} else {material.updated_at=input.timestamp;material.record_version+=1;summary.materialsUpdated++;}
    const docId=IdFactory.document(material.material_id); let document=db.documents.find(d=>d.document_id===docId);
    if(!document){document={document_id:docId,material_id:material.material_id,document_type_id:USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID,document_number:null,document_version:null,language_code:"ru",region_code:"RU",url:null,document_date:null,effective_date:null,retrieved_at:input.timestamp,checksum:input.checksum,mime_type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",file_name:input.fileName,is_primary:true,status:"active",notes:"Пользовательский импорт Excel."} satisfies Document;db.documents.push(document);} else {document.checksum=input.checksum;document.file_name=input.fileName;document.retrieved_at=input.timestamp;}
    const norm=db.consumption_norms.find(n=>n.material_id===material!.material_id&&n.is_default&&n.status==="active");
    if(norm){norm.value_nominal=row.consumptionNorm;norm.unit_id=DEFAULT_UNIT_ID;norm.substrate_id=SUBSTRATE_UNSPECIFIED_ID;norm.source_document_id=docId;norm.updated_at=input.timestamp;norm.record_version+=1;summary.normsUpdated++;}
    else {db.consumption_norms.push({norm_id:IdFactory.norm(material.material_id),material_id:material.material_id,norm_type:"theoretical",basis_type:"area",value_min:null,value_nominal:row.consumptionNorm,value_max:null,unit_id:DEFAULT_UNIT_ID,dry_film_thickness_um:null,wet_film_thickness_um:null,coats_count:1,application_method_id:DEFAULT_METHOD_ID,substrate_id:SUBSTRATE_UNSPECIFIED_ID,temperature_c:null,humidity_pct:null,application_loss_factor:1,is_default:true,status:"active",valid_from:null,valid_to:null,source_document_id:docId,verified_at:null,verified_by:null,created_at:input.timestamp,updated_at:input.timestamp,record_version:1,notes:"Норма из пользовательского Excel.",source_type:"user_excel_import"});summary.normsAdded++;}
    const names=splitSubstrates(row.substrateApplications); const targetIds:string[]=[];
    for(const name of names){let sub=subByName.get(normalizeName(name));if(!sub){sub={substrate_id:IdFactory.substrate(name),name,is_active:true} satisfies Substrate;db.substrates.push(sub);subByName.set(normalizeName(name),sub);summary.substratesAdded++;}targetIds.push(sub.substrate_id);}
    const effectiveIds=targetIds.length?targetIds:[SUBSTRATE_UNSPECIFIED_ID]; db.material_substrates=db.material_substrates.filter(ms=>ms.material_id!==material!.material_id);
    for(const substrateId of effectiveIds) db.material_substrates.push({material_substrate_id:IdFactory.materialSubstrate(material.material_id,substrateId),material_id:material.material_id,substrate_id:substrateId,created_at:input.timestamp,source_import_batch_id:batchId});
    summary.rowsAccepted++; if(isNew===false && summary.materialsUpdated<0) summary.materialsUpdated=0;
  }
  db.import_batches=db.import_batches.filter(b=>b.import_batch_id!==batchId); db.import_batches.push({import_batch_id:batchId,file_name:input.fileName,file_size:input.fileSize,checksum:input.checksum,imported_at:input.timestamp,rows_total:input.rows.length,rows_imported:summary.rowsAccepted,rows_rejected:0,status:"active",database_version_before:input.database.metadata.schema_version,database_version_after:"1.2"});
  db.metadata={...db.metadata,schema_version:"1.2",generated_at:input.timestamp,dataset_type:"user",is_demo:false,allow_production_use:false,warning:"Пользовательская база. Нормативы требуют проверки ответственным специалистом."};
  try { const candidate=parseAndValidateDatabase(db); return {candidate,issues,summary,checksum:input.checksum,fileName:input.fileName,fileSize:input.fileSize}; }
  catch(error:unknown){const message=error instanceof Error?error.message:"Неизвестная ошибка";return {candidate:null,issues:[{code:"database_validation_failed",severity:"error",message,row:null,column:null}],summary,checksum:input.checksum,fileName:input.fileName,fileSize:input.fileSize};}
}
