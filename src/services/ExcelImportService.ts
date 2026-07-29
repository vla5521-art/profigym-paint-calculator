import type { Database } from "../types/database.ts";
import type { ImportPlan } from "../types/import.ts";
import { buildImportPlan } from "../import/DatabaseImportTransformer.ts";
import { parseProfigymExcel } from "./excelImportParser.ts";

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export class ExcelImportService {
  public async analyze(file: File, activeDatabase: Database): Promise<ImportPlan> {
    const buffer = await file.arrayBuffer();
    const parseFile = new File([buffer], file.name, { type: file.type, lastModified: file.lastModified });
    const parsed = await parseProfigymExcel(parseFile);
    const checksum = await sha256Hex(buffer);
    const summary = { rowsTotal: parsed.rows.length, rowsAccepted: 0, manufacturersAdded: 0, materialsAdded: 0, materialsUpdated: 0, substratesAdded: 0, normsAdded: 0, normsUpdated: 0, duplicatesSkipped: 0 };
    if (parsed.issues.some((item) => item.severity === "error")) {
      return { candidate: null, issues: parsed.issues, summary, checksum, fileName: file.name, fileSize: file.size };
    }
    const plan = buildImportPlan({ database: activeDatabase, rows: parsed.rows, fileName: file.name, fileSize: file.size, checksum, timestamp: new Date().toISOString() });
    return { ...plan, issues: [...parsed.issues, ...plan.issues] };
  }
}
