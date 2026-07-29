import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { XlsxArchive } from "../src/services/xlsxZipReader.ts";

const templatePath = new URL("../public/templates/PROFiGYM_шаблон_импорта.xlsx", import.meta.url);

test("минимальный шаблон является корректным XLSX-архивом", async () => {
  const file = await readFile(templatePath);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const archive = await XlsxArchive.fromArrayBuffer(buffer);

  assert.equal(archive.has("xl/workbook.xml"), true);
  assert.equal(archive.has("xl/_rels/workbook.xml.rels"), true);
  assert.match(await archive.readText("xl/workbook.xml"), /<(?:\w+:)?workbook/);
});
