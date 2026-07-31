import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";
import { build as viteBuild } from "vite";
import {
  TEMPLATE_FILE_NAME,
  TEMPLATE_RELATIVE_PATH,
  verifyTemplatePackaging,
} from "../scripts/verify-template-packaging.mjs";

test("Excel-шаблон имеет точное UTF-8 имя и идентичную production-копию", {
  timeout: 120_000,
}, async () => {
  assert.equal(TEMPLATE_FILE_NAME, "PROFiGYM_шаблон_импорта.xlsx");
  assert.equal(TEMPLATE_RELATIVE_PATH, "templates/PROFiGYM_шаблон_импорта.xlsx");

  await verifyTemplatePackaging({ requireDist: false });

  await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
  await viteBuild({ logLevel: "silent" });

  const result = await verifyTemplatePackaging();
  assert.equal(result.sourceSha256, result.productionSha256);
});
