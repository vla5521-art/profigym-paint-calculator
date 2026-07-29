import { useMemo, useState } from "react";
import type { WritableDatabaseRepository } from "../repository/WritableDatabaseRepository.ts";
import { ExcelImportService } from "../services/ExcelImportService.ts";
import { IMPORT_MAX_DATA_ROWS, IMPORT_MAX_FILE_SIZE_BYTES, type ImportPlan } from "../types/import.ts";

const TEMPLATE_URL = "/templates/PROFiGYM_шаблон_импорта.xlsx";
interface Props { repository: WritableDatabaseRepository; onDatabaseChanged: () => Promise<void>; }
function downloadText(fileName:string,text:string,mime:string):void{const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=fileName;link.click();URL.revokeObjectURL(url);}
export function ExcelImportPanel({repository,onDatabaseChanged}:Props):React.JSX.Element{
  const service=useMemo(()=>new ExcelImportService(),[]);const[fileName,setFileName]=useState<string|null>(null);const[plan,setPlan]=useState<ImportPlan|null>(null);const[busy,setBusy]=useState(false);const[message,setMessage]=useState<string|null>(null);
  const errors=plan?.issues.filter(i=>i.severity==="error")??[];const canApply=Boolean(plan?.candidate)&&errors.length===0&&!busy;
  async function analyze(file:File|undefined):Promise<void>{setFileName(file?.name??null);setPlan(null);setMessage(null);if(!file)return;setBusy(true);try{setPlan(await service.analyze(file,repository.getDatabase()));}catch(error:unknown){setMessage(error instanceof Error?error.message:"Не удалось проанализировать файл.");}finally{setBusy(false);}}
  async function apply():Promise<void>{if(!plan||!canApply)return;setBusy(true);setMessage(null);try{await repository.applyImportPlan(plan);await onDatabaseChanged();setMessage("Импорт успешно применён. Новые материалы доступны в калькуляторе.");setPlan(null);}catch(error:unknown){setMessage(error instanceof Error?error.message:"Не удалось применить импорт.");}finally{setBusy(false);}}
  async function restore():Promise<void>{if(!window.confirm("Восстановить последнюю резервную копию пользовательской базы?"))return;setBusy(true);try{const restored=await repository.restoreBackup();if(restored){await onDatabaseChanged();setMessage("Резервная копия восстановлена.");}else setMessage("Резервная копия отсутствует.");}finally{setBusy(false);}}
  async function clear():Promise<void>{if(!window.confirm("Удалить пользовательскую базу и вернуться к встроенной базе?"))return;setBusy(true);try{await repository.clearUserDatabase();await onDatabaseChanged();setPlan(null);setMessage("Пользовательская база удалена. Активна встроенная база.");}finally{setBusy(false);}}
  return <section className="import-card no-print" aria-labelledby="excel-import-title">
    <div className="import-card-header"><div><h2 id="excel-import-title">Импорт базы из Excel</h2><p>Данные сохраняются только в текущем браузере. Перед применением создаётся локальная резервная копия.</p></div><a className="secondary-button template-download" href={TEMPLATE_URL} download>Скачать шаблон Excel</a></div>
    <div className="import-contract"><span>Производитель</span><span>Материал</span><span>Норма расхода, кг/м²</span><span>Поверхности через «;»</span></div>
    <label className="file-picker"><span>{busy?"Обработка…":"Загрузить Excel"}</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event:{currentTarget:HTMLInputElement})=>{void analyze(event.currentTarget.files?.[0]);}}/></label>
    <p className="field-hint import-limits">Только .xlsx, лист «Материалы», до {Math.round(IMPORT_MAX_FILE_SIZE_BYTES/1024/1024)} МБ и {IMPORT_MAX_DATA_ROWS} строк.</p>
    {fileName&&<p className="import-file-name">Файл: <strong>{fileName}</strong></p>}
    {plan&&<div className="import-result" aria-live="polite"><p className={errors.length?"import-summary import-summary-error":"import-summary import-summary-ok"}>Строк принято: <strong>{plan.summary.rowsAccepted}</strong>. Производителей добавлено: <strong>{plan.summary.manufacturersAdded}</strong>. Материалов добавлено: <strong>{plan.summary.materialsAdded}</strong>, обновлено: <strong>{plan.summary.materialsUpdated}</strong>. Ошибок: <strong>{errors.length}</strong>.</p>
      {plan.issues.length>0&&<div className="import-preview-wrap"><table className="import-preview"><thead><tr><th>Строка</th><th>Поле</th><th>Сообщение</th></tr></thead><tbody>{plan.issues.map((item,index)=><tr key={`${item.code}-${item.row??"file"}-${index}`}><td>{item.row??"Файл"}</td><td>{item.column??"—"}</td><td>{item.message}{item.relatedRows?` Строки: ${item.relatedRows.join(", ")}.`:""}</td></tr>)}</tbody></table></div>}
      <button className="calculate-button import-apply" type="button" disabled={!canApply} onClick={()=>{void apply();}}>Применить изменения</button></div>}
    {message&&<p className="import-summary import-summary-ok" aria-live="polite">{message}</p>}
    <div className="import-actions"><button className="secondary-button" type="button" onClick={()=>downloadText("PROFiGYM_active_database.json",repository.exportActiveDatabase(),"application/json")}>Экспорт активной базы JSON</button><button className="secondary-button" type="button" disabled={busy} onClick={()=>{void restore();}}>Восстановить backup</button><button className="secondary-button danger-button" type="button" disabled={busy||!repository.hasUserDatabase()} onClick={()=>{void clear();}}>Удалить пользовательскую базу</button></div>
  </section>;
}
