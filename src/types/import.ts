import type { Database } from "./database.ts";

export const IMPORT_TEMPLATE_HEADERS = [
  "Производитель",
  "Материал",
  "Норма расхода, кг/м²",
  "Поверхности применения",
] as const;
export const IMPORT_SHEET_NAME = "Материалы";
export const IMPORT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const IMPORT_MAX_DATA_ROWS = 5000;
export const IMPORT_MAX_MANUFACTURER_LENGTH = 120;
export const IMPORT_MAX_MATERIAL_LENGTH = 200;
export const IMPORT_MAX_SUBSTRATES_LENGTH = 1000;

export type ImportColumn = "manufacturer" | "material" | "consumptionNorm" | "substrateApplications";
export type ImportIssueSeverity = "error" | "warning";
export type ImportIssueCode =
  | "invalid_file_extension" | "file_too_large" | "invalid_xlsx_archive" | "missing_workbook"
  | "missing_worksheet" | "invalid_sheet_name" | "invalid_template_headers" | "too_many_rows"
  | "empty_required_cell" | "value_too_long" | "invalid_consumption_norm" | "unexpected_extra_columns"
  | "empty_file" | "xlsx_read_error" | "conflicting_duplicate" | "database_validation_failed";
export interface RawImportRow { sourceRow: number; manufacturer: string; material: string; consumptionNorm: number; substrateApplications: string | null; }
export interface ImportIssue { code: ImportIssueCode; severity: ImportIssueSeverity; message: string; row: number | null; column: ImportColumn | null; rawValue?: string | null; relatedRows?: number[]; }
export interface ExcelParseResult { rows: RawImportRow[]; issues: ImportIssue[]; }
export interface ImportSummary { rowsTotal: number; rowsAccepted: number; manufacturersAdded: number; materialsAdded: number; materialsUpdated: number; substratesAdded: number; normsAdded: number; normsUpdated: number; duplicatesSkipped: number; }
export interface ImportPlan { candidate: Database | null; issues: ImportIssue[]; summary: ImportSummary; checksum: string; fileName: string; fileSize: number; }
export interface ImportApplyResult { importBatchId: string; backupCreated: boolean; summary: ImportSummary; }
