import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XlsxArchive } from "../src/services/xlsxZipReader.ts";
import { IMPORT_SHEET_NAME, IMPORT_TEMPLATE_HEADERS } from "../src/types/import.ts";

export const TEMPLATE_FILE_NAME = "PROFiGYM_шаблон_импорта.xlsx";
export const TEMPLATE_RELATIVE_PATH = path.join("templates", TEMPLATE_FILE_NAME);

const DAMAGED_TEMPLATE_PATTERN = /^PROFiGYM_#U.*\.xlsx$/u;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifyTemplateDirectory(directory, label) {
  const entries = await readdir(directory);
  const templateEntries = entries.filter(
    (entry) => entry.startsWith("PROFiGYM_") && entry.endsWith(".xlsx"),
  );

  assert.deepEqual(
    templateEntries,
    [TEMPLATE_FILE_NAME],
    `${label}: ожидается единственный шаблон с точным Unicode-именем`,
  );
  assert.equal(
    entries.some((entry) => DAMAGED_TEMPLATE_PATTERN.test(entry)),
    false,
    `${label}: обнаружено повреждённое имя PROFiGYM_#U*.xlsx`,
  );
  assert.equal(
    Buffer.from(templateEntries[0], "utf8").equals(Buffer.from(TEMPLATE_FILE_NAME, "utf8")),
    true,
    `${label}: имя шаблона не совпадает с ожидаемой UTF-8 последовательностью`,
  );

  const templatePath = path.join(directory, TEMPLATE_FILE_NAME);
  assert.equal((await stat(templatePath)).isFile(), true, `${label}: шаблон не является файлом`);
  return templatePath;
}

async function verifyXlsx(templatePath) {
  const file = await readFile(templatePath);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const archive = await XlsxArchive.fromArrayBuffer(buffer);

  assert.equal(archive.has("[Content_Types].xml"), true);
  assert.equal(archive.has("xl/workbook.xml"), true);
  assert.equal(archive.has("xl/_rels/workbook.xml.rels"), true);
  assert.equal(archive.has("xl/worksheets/sheet1.xml"), true);

  const workbookXml = await archive.readText("xl/workbook.xml");
  assert.match(workbookXml, /<(?:\w+:)?workbook/u);
  assert.match(workbookXml, new RegExp(`name="${IMPORT_SHEET_NAME}"`, "u"));

  const worksheetXml = await archive.readText("xl/worksheets/sheet1.xml");
  IMPORT_TEMPLATE_HEADERS.forEach((header, index) => {
    const column = String.fromCharCode("A".charCodeAt(0) + index);
    assert.match(
      worksheetXml,
      new RegExp(`<x:c r="${column}1"[^>]*>.*?<x:v>${header}</x:v>`, "u"),
    );
  });

  return file;
}

export async function verifyTemplatePackaging({
  projectRoot = DEFAULT_PROJECT_ROOT,
  requireDist = true,
} = {}) {
  const publicDirectory = path.join(projectRoot, "public", "templates");
  const sourcePath = await verifyTemplateDirectory(publicDirectory, "public/templates");
  const sourceBytes = await verifyXlsx(sourcePath);
  const sourceSha256 = sha256(sourceBytes);

  if (!requireDist) {
    return { sourcePath, sourceSha256 };
  }

  const distDirectory = path.join(projectRoot, "dist", "templates");
  const productionPath = await verifyTemplateDirectory(distDirectory, "dist/templates");
  const productionBytes = await verifyXlsx(productionPath);
  const productionSha256 = sha256(productionBytes);

  assert.equal(
    productionSha256,
    sourceSha256,
    "SHA-256 production-копии шаблона отличается от public-источника",
  );

  return {
    sourcePath,
    productionPath,
    sourceSha256,
    productionSha256,
    sizeBytes: sourceBytes.byteLength,
  };
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  const result = await verifyTemplatePackaging();
  console.log(JSON.stringify({ event: "template_packaging_verified", ...result }, null, 2));
}
