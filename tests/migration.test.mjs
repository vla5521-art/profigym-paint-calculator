import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  migrateDatabase11To12,
  migrateDatabaseToLatest,
  SUBSTRATE_UNSPECIFIED_ID,
  USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID,
} from "../src/utils/migration.ts";

async function loadSchema12Fixture() {
  return JSON.parse(await readFile(new URL("../public/data/database.json", import.meta.url), "utf8"));
}

function toSchema11(database12) {
  const database11 = structuredClone(database12);
  database11.metadata.schema_version = "1.1";
  delete database11.material_substrates;
  delete database11.import_batches;
  database11.substrates = database11.substrates.filter(
    (item) => item.substrate_id !== SUBSTRATE_UNSPECIFIED_ID,
  );
  database11.document_types = database11.document_types.filter(
    (item) => item.document_type_id !== USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID,
  );
  database11.database_versions = database11.database_versions.filter((item) => item.version !== "1.2");
  return database11;
}

test("миграция 1.1→1.2 не изменяет исходный объект и сохраняет существующие ID", async () => {
  const schema11 = toSchema11(await loadSchema12Fixture());
  const before = structuredClone(schema11);
  const existingIds = {
    manufacturers: schema11.manufacturers.map((item) => item.manufacturer_id),
    materials: schema11.materials.map((item) => item.material_id),
    norms: schema11.consumption_norms.map((item) => item.norm_id),
    documents: schema11.documents.map((item) => item.document_id),
  };

  const migrated = migrateDatabase11To12(schema11);

  assert.deepEqual(schema11, before);
  assert.equal(migrated.metadata.schema_version, "1.2");
  assert.deepEqual(migrated.manufacturers.map((item) => item.manufacturer_id), existingIds.manufacturers);
  assert.deepEqual(migrated.materials.map((item) => item.material_id), existingIds.materials);
  assert.deepEqual(migrated.consumption_norms.map((item) => item.norm_id), existingIds.norms);
  assert.deepEqual(migrated.documents.map((item) => item.document_id), existingIds.documents);
});

test("миграция добавляет служебные записи и новые коллекции", async () => {
  const migrated = migrateDatabase11To12(toSchema11(await loadSchema12Fixture()));

  assert.ok(migrated.substrates.some((item) => item.substrate_id === SUBSTRATE_UNSPECIFIED_ID));
  assert.ok(migrated.document_types.some(
    (item) => item.document_type_id === USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID,
  ));
  assert.ok(Array.isArray(migrated.material_substrates));
  assert.ok(migrated.material_substrates.length > 0);
  assert.deepEqual(migrated.import_batches, []);
  assert.ok(migrated.database_versions.some((item) => item.version === "1.2"));
});

test("миграция детерминирована", async () => {
  const schema11 = toSchema11(await loadSchema12Fixture());
  assert.deepEqual(migrateDatabase11To12(schema11), migrateDatabase11To12(schema11));
});

test("схема 1.2 клонируется без повторной миграции", async () => {
  const schema12 = await loadSchema12Fixture();
  const result = migrateDatabaseToLatest(schema12);
  assert.deepEqual(result, schema12);
  assert.notEqual(result, schema12);
});
