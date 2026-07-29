import type {
  Database,
  DatabaseVersion,
  DocumentType,
  MaterialSubstrate,
  Substrate,
} from "../types/database.ts";

export const SCHEMA_VERSION_1_1 = "1.1";
export const SCHEMA_VERSION_1_2 = "1.2";
export const SUBSTRATE_UNSPECIFIED_ID = "substrate_unspecified";
export const USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID = "user_excel_import";

type Database11 = Omit<Database, "material_substrates" | "import_batches"> & {
  material_substrates?: never;
  import_batches?: never;
};

const clone = <T>(value: T): T => structuredClone(value);

const createUnspecifiedSubstrate = (): Substrate => ({
  substrate_id: SUBSTRATE_UNSPECIFIED_ID,
  name: "Поверхность не указана",
  is_active: true,
});

const createUserExcelDocumentType = (): DocumentType => ({
  document_type_id: USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID,
  name_ru: "Пользовательский импорт Excel",
  name_en: "User Excel import",
  is_active: true,
});

const createVersionRecord = (releasedAt: string): DatabaseVersion => ({
  version: SCHEMA_VERSION_1_2,
  released_at: releasedAt,
  change_type: "minor",
  description: "Добавлены связи материалов с поверхностями и журнал пакетов импорта Excel.",
  status: "active",
});

function materialSubstrateId(materialId: string, substrateId: string): string {
  return `material_substrate_${materialId}__${substrateId}`;
}

function deriveMaterialSubstrates(database: Database11): MaterialSubstrate[] {
  const createdAt = database.metadata.generated_at;
  const pairs = new Map<string, MaterialSubstrate>();

  for (const norm of database.consumption_norms) {
    const key = `${norm.material_id}\u0000${norm.substrate_id}`;
    if (pairs.has(key)) continue;
    pairs.set(key, {
      material_substrate_id: materialSubstrateId(norm.material_id, norm.substrate_id),
      material_id: norm.material_id,
      substrate_id: norm.substrate_id,
      created_at: createdAt,
      source_import_batch_id: null,
    });
  }

  return [...pairs.values()];
}

/**
 * Чистая и детерминированная миграция: не изменяет исходный объект,
 * не использует текущее время и не меняет существующие идентификаторы.
 */
export function migrateDatabase11To12(source: Database11): Database {
  const database = clone(source);
  const releasedAt = database.metadata.generated_at;

  const substrates = database.substrates.some(
    (item) => item.substrate_id === SUBSTRATE_UNSPECIFIED_ID,
  )
    ? database.substrates
    : [...database.substrates, createUnspecifiedSubstrate()];

  const documentTypes = database.document_types.some(
    (item) => item.document_type_id === USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID,
  )
    ? database.document_types
    : [...database.document_types, createUserExcelDocumentType()];

  const databaseVersions = database.database_versions.some(
    (item) => item.version === SCHEMA_VERSION_1_2,
  )
    ? database.database_versions
    : [...database.database_versions, createVersionRecord(releasedAt)];

  return {
    ...database,
    metadata: { ...database.metadata, schema_version: SCHEMA_VERSION_1_2 },
    substrates,
    document_types: documentTypes,
    database_versions: databaseVersions,
    material_substrates: deriveMaterialSubstrates(database),
    import_batches: [],
  };
}

export function migrateDatabaseToLatest(source: Database): Database {
  if (source.metadata.schema_version === SCHEMA_VERSION_1_2) return clone(source);
  if (source.metadata.schema_version === SCHEMA_VERSION_1_1) {
    return migrateDatabase11To12(source as unknown as Database11);
  }
  throw new Error(`Неподдерживаемая версия схемы: ${source.metadata.schema_version}`);
}
