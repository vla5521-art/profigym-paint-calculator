import {
  IMPORT_MAX_DATA_ROWS,
  IMPORT_MAX_FILE_SIZE_BYTES,
  IMPORT_MAX_MANUFACTURER_LENGTH,
  IMPORT_MAX_MATERIAL_LENGTH,
  IMPORT_MAX_SUBSTRATES_LENGTH,
  IMPORT_SHEET_NAME,
  IMPORT_TEMPLATE_HEADERS,
  type ExcelParseResult,
  type ImportColumn,
  type ImportIssue,
  type RawImportRow,
} from "../types/import.ts";
import { XlsxArchive } from "./xlsxZipReader.ts";

const XML_MIME_TYPE = "application/xml";
const HEADER_COLUMNS: readonly ImportColumn[] = [
  "manufacturer",
  "material",
  "consumptionNorm",
  "substrateApplications",
];

function issue(
  code: ImportIssue["code"],
  message: string,
  row: number | null = null,
  column: ImportColumn | null = null,
): ImportIssue {
  return { code, severity: "error", message, row, column };
}

function parseXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, XML_MIME_TYPE);
  if (document.getElementsByTagName("parsererror").length > 0) throw new Error("XML_PARSE_ERROR");
  return document;
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseRussianDecimal(value: string): number | null {
  const normalized = normalizeText(value).replace(/\s/g, "").replace(",", ".");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function columnIndexFromReference(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function resolveTargetPath(basePath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = basePath.split("/");
  parts.pop();
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== "." && segment !== "") parts.push(segment);
  }
  return parts.join("/");
}

async function findWorksheetPath(archive: XlsxArchive): Promise<string> {
  if (!archive.has("xl/workbook.xml") || !archive.has("xl/_rels/workbook.xml.rels")) {
    throw new Error("WORKBOOK_MISSING");
  }
  const workbook = parseXml(await archive.readText("xl/workbook.xml"));
  const sheets = [...workbook.getElementsByTagNameNS("*", "sheet")];
  const targetSheet = sheets.find((item) => item.getAttribute("name") === IMPORT_SHEET_NAME);
  if (!targetSheet) throw new Error("SHEET_NAME_INVALID");
  const relationshipId = targetSheet.getAttribute("r:id") ?? targetSheet.getAttributeNS(
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "id",
  );
  if (!relationshipId) throw new Error("WORKSHEET_MISSING");

  const relationships = parseXml(await archive.readText("xl/_rels/workbook.xml.rels"));
  const relationship = [...relationships.getElementsByTagNameNS("*", "Relationship")].find(
    (item) => item.getAttribute("Id") === relationshipId,
  );
  const target = relationship?.getAttribute("Target");
  if (!target) throw new Error("WORKSHEET_MISSING");
  return resolveTargetPath("xl/workbook.xml", target);
}

async function readSharedStrings(archive: XlsxArchive): Promise<string[]> {
  if (!archive.has("xl/sharedStrings.xml")) return [];
  const document = parseXml(await archive.readText("xl/sharedStrings.xml"));
  return [...document.getElementsByTagNameNS("*", "si")].map((item) =>
    normalizeText([...item.getElementsByTagNameNS("*", "t")].map((node) => node.textContent ?? "").join("")),
  );
}

function readCellValue(cell: Element, sharedStrings: readonly string[]): string {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return normalizeText([...cell.getElementsByTagNameNS("*", "t")].map((node) => node.textContent ?? "").join(""));
  }
  const raw = cell.getElementsByTagNameNS("*", "v").item(0)?.textContent ?? "";
  if (type === "s") {
    const index = Number(raw);
    return Number.isInteger(index) ? sharedStrings[index] ?? "" : "";
  }
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return normalizeText(raw);
}

function readWorksheetRows(document: Document, sharedStrings: readonly string[]): Map<number, string[]> {
  const rows = new Map<number, string[]>();
  for (const rowElement of document.getElementsByTagNameNS("*", "row")) {
    const rowNumber = Number(rowElement.getAttribute("r"));
    if (!Number.isInteger(rowNumber) || rowNumber < 1) continue;
    const values: string[] = [];
    for (const cell of rowElement.getElementsByTagNameNS("*", "c")) {
      const reference = cell.getAttribute("r") ?? "";
      const columnIndex = columnIndexFromReference(reference);
      if (columnIndex >= 0) values[columnIndex] = readCellValue(cell, sharedStrings);
    }
    rows.set(rowNumber, values);
  }
  return rows;
}

function validateHeaders(values: readonly string[]): ImportIssue[] {
  const actual = IMPORT_TEMPLATE_HEADERS.map((_, index) => normalizeText(values[index] ?? ""));
  const issues: ImportIssue[] = [];
  IMPORT_TEMPLATE_HEADERS.forEach((expected, index) => {
    if (actual[index] !== expected) {
      issues.push(issue(
        "invalid_template_headers",
        `Столбец ${index + 1} должен называться «${expected}». Получено: «${actual[index] || "пусто"}».`,
        1,
        HEADER_COLUMNS[index] ?? null,
      ));
    }
  });
  if (values.slice(4).some((value) => normalizeText(value ?? "") !== "")) {
    issues.push(issue(
      "unexpected_extra_columns",
      "В шаблоне разрешены только четыре фиксированных столбца без дополнительных полей.",
      1,
    ));
  }
  return issues;
}

export async function parseProfigymExcel(file: File): Promise<ExcelParseResult> {
  const rows: RawImportRow[] = [];
  const issues: ImportIssue[] = [];

  if (!file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
    return { rows, issues: [issue("invalid_file_extension", "Разрешены только файлы формата .xlsx.")] };
  }
  if (file.size > IMPORT_MAX_FILE_SIZE_BYTES) {
    return {
      rows,
      issues: [issue(
        "file_too_large",
        `Размер файла превышает лимит ${Math.round(IMPORT_MAX_FILE_SIZE_BYTES / 1024 / 1024)} МБ.`,
      )],
    };
  }

  try {
    const archive = await XlsxArchive.fromArrayBuffer(await file.arrayBuffer());
    const worksheetPath = await findWorksheetPath(archive);
    if (!archive.has(worksheetPath)) {
      return { rows, issues: [issue("missing_worksheet", "В книге не найден первый рабочий лист.")] };
    }
    const sharedStrings = await readSharedStrings(archive);
    const worksheet = parseXml(await archive.readText(worksheetPath));
    const excelRows = readWorksheetRows(worksheet, sharedStrings);

    const headerIssues = validateHeaders(excelRows.get(1) ?? []);
    if (headerIssues.length > 0) return { rows, issues: headerIssues };

    const populatedRowNumbers = [...excelRows.keys()]
      .filter((rowNumber) => rowNumber >= 2)
      .filter((rowNumber) => (excelRows.get(rowNumber) ?? []).some((value) => normalizeText(value ?? "") !== ""))
      .sort((left, right) => left - right);

    if (populatedRowNumbers.length === 0) {
      return { rows, issues: [issue("empty_file", "В файле нет строк с данными.")] };
    }
    if (populatedRowNumbers.length > IMPORT_MAX_DATA_ROWS) {
      return {
        rows,
        issues: [issue(
          "too_many_rows",
          `Количество строк превышает лимит ${IMPORT_MAX_DATA_ROWS}.`,
        )],
      };
    }

    for (const rowNumber of populatedRowNumbers) {
      const values = excelRows.get(rowNumber) ?? [];
      if (values.slice(4).some((value) => normalizeText(value ?? "") !== "")) {
        issues.push(issue(
          "unexpected_extra_columns",
          "Строка содержит данные за пределами четырёх разрешённых столбцов.",
          rowNumber,
        ));
      }

      const manufacturer = normalizeText(values[0] ?? "");
      const material = normalizeText(values[1] ?? "");
      const normRaw = normalizeText(values[2] ?? "");
      const substrate = normalizeText(values[3] ?? "");
      let rowHasError = false;

      if (manufacturer.length > IMPORT_MAX_MANUFACTURER_LENGTH) {
        issues.push(issue("value_too_long", `Название производителя длиннее ${IMPORT_MAX_MANUFACTURER_LENGTH} символов.`, rowNumber, "manufacturer"));
        rowHasError = true;
      }
      if (!manufacturer) {
        issues.push(issue("empty_required_cell", "Не указан производитель.", rowNumber, "manufacturer"));
        rowHasError = true;
      }
      if (material.length > IMPORT_MAX_MATERIAL_LENGTH) {
        issues.push(issue("value_too_long", `Название материала длиннее ${IMPORT_MAX_MATERIAL_LENGTH} символов.`, rowNumber, "material"));
        rowHasError = true;
      }
      if (!material) {
        issues.push(issue("empty_required_cell", "Не указан материал.", rowNumber, "material"));
        rowHasError = true;
      }
      if (substrate.length > IMPORT_MAX_SUBSTRATES_LENGTH) {
        issues.push(issue("value_too_long", `Поле поверхностей длиннее ${IMPORT_MAX_SUBSTRATES_LENGTH} символов.`, rowNumber, "substrateApplications"));
        rowHasError = true;
      }
      const consumptionNorm = parseRussianDecimal(normRaw);
      if (consumptionNorm === null) {
        issues.push(issue(
          "invalid_consumption_norm",
          "Норма расхода должна быть положительным числом. Допустимы 0,25 и 0.25.",
          rowNumber,
          "consumptionNorm",
        ));
        rowHasError = true;
      }

      if (!rowHasError && consumptionNorm !== null) {
        rows.push({
          sourceRow: rowNumber,
          manufacturer,
          material,
          consumptionNorm,
          substrateApplications: substrate || null,
        });
      }
    }

    return { rows, issues };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "WORKBOOK_MISSING") {
      return { rows, issues: [issue("missing_workbook", "Файл не содержит корректную структуру книги Excel.")] };
    }
    if (message === "SHEET_NAME_INVALID") {
      return { rows, issues: [issue("invalid_sheet_name", `В книге должен быть лист «${IMPORT_SHEET_NAME}».`)] };
    }
    if (message === "WORKSHEET_MISSING") {
      return { rows, issues: [issue("missing_worksheet", "В книге не найден первый рабочий лист.")] };
    }
    if (message.startsWith("ZIP_")) {
      return { rows, issues: [issue("invalid_xlsx_archive", "Файл повреждён или не является корректным .xlsx.")] };
    }
    return { rows, issues: [issue("xlsx_read_error", "Не удалось прочитать файл Excel.")] };
  }
}
