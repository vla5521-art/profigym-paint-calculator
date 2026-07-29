import type { Database } from "../types/database.ts";
import {
  migrateDatabaseToLatest,
  SCHEMA_VERSION_1_1,
  SCHEMA_VERSION_1_2,
  SUBSTRATE_UNSPECIFIED_ID,
  USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID,
} from "./migration.ts";

export class DatabaseValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(`База данных не прошла проверку: ${issues.join("; ")}`);
    this.name = "DatabaseValidationError";
    this.issues = issues;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const baseRequiredArrays = [
  "manufacturers",
  "categories",
  "technologies",
  "gloss_levels",
  "units",
  "application_methods",
  "substrates",
  "materials",
  "consumption_norms",
  "documents",
  "document_types",
  "statuses",
  "languages",
  "regions",
  "database_versions",
] as const;

const schema12RequiredArrays = ["material_substrates", "import_batches"] as const;

export function parseAndValidateDatabase(value: unknown): Database {
  const issues: string[] = [];

  if (!isRecord(value)) {
    throw new DatabaseValidationError(["корневое значение JSON должно быть объектом"]);
  }

  if (!isRecord(value.metadata)) {
    issues.push("отсутствует объект metadata");
  }

  for (const section of baseRequiredArrays) {
    if (!Array.isArray(value[section])) issues.push(`отсутствует массив ${section}`);
  }

  if (issues.length > 0) throw new DatabaseValidationError(issues);

  const schemaVersion = isRecord(value.metadata) ? value.metadata.schema_version : undefined;
  if (schemaVersion !== SCHEMA_VERSION_1_1 && schemaVersion !== SCHEMA_VERSION_1_2) {
    throw new DatabaseValidationError([`неподдерживаемая версия схемы ${String(schemaVersion)}`]);
  }

  if (schemaVersion === SCHEMA_VERSION_1_2) {
    for (const section of schema12RequiredArrays) {
      if (!Array.isArray(value[section])) issues.push(`для схемы 1.2 отсутствует массив ${section}`);
    }
  }

  if (issues.length > 0) throw new DatabaseValidationError(issues);

  let database: Database;
  try {
    database = migrateDatabaseToLatest(value as unknown as Database);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "неизвестная ошибка миграции";
    throw new DatabaseValidationError([message]);
  }

  validateContent(database);
  return database;
}

function validateContent(database: Database): void {
  const issues: string[] = [];
  const nonEmptySections: ReadonlyArray<keyof Database> = [
    "manufacturers",
    "categories",
    "technologies",
    "units",
    "application_methods",
    "substrates",
    "materials",
    "consumption_norms",
    "documents",
  ];

  for (const section of nonEmptySections) {
    const collection = database[section];
    if (Array.isArray(collection) && collection.length === 0) {
      issues.push(`обязательный раздел ${section} пуст`);
    }
  }

  if (database.metadata.schema_version !== SCHEMA_VERSION_1_2) {
    issues.push(`после миграции ожидалась схема ${SCHEMA_VERSION_1_2}`);
  }

  validateServiceRecords(database, issues);
  validateUniqueIds(database, issues);
  validateReferences(database, issues);
  validateDefaultNorms(database, issues);
  validateImportBatches(database, issues);

  if (issues.length > 0) throw new DatabaseValidationError(issues);
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function validateServiceRecords(database: Database, issues: string[]): void {
  if (!database.substrates.some((item) => item.substrate_id === SUBSTRATE_UNSPECIFIED_ID)) {
    issues.push(`отсутствует служебная поверхность ${SUBSTRATE_UNSPECIFIED_ID}`);
  }
  if (!database.document_types.some(
    (item) => item.document_type_id === USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID,
  )) {
    issues.push(`отсутствует служебный тип документа ${USER_EXCEL_IMPORT_DOCUMENT_TYPE_ID}`);
  }
}

function validateUniqueIds(database: Database, issues: string[]): void {
  const checks: ReadonlyArray<[string, readonly string[]]> = [
    ["manufacturer_id", database.manufacturers.map((item) => item.manufacturer_id)],
    ["category_id", database.categories.map((item) => item.category_id)],
    ["technology_id", database.technologies.map((item) => item.technology_id)],
    ["gloss_id", database.gloss_levels.map((item) => item.gloss_id)],
    ["unit_id", database.units.map((item) => item.unit_id)],
    ["method_id", database.application_methods.map((item) => item.method_id)],
    ["substrate_id", database.substrates.map((item) => item.substrate_id)],
    ["material_id", database.materials.map((item) => item.material_id)],
    ["material_substrate_id", database.material_substrates.map((item) => item.material_substrate_id)],
    ["import_batch_id", database.import_batches.map((item) => item.import_batch_id)],
    ["norm_id", database.consumption_norms.map((item) => item.norm_id)],
    ["document_id", database.documents.map((item) => item.document_id)],
  ];

  for (const [field, values] of checks) {
    const duplicates = findDuplicates(values);
    if (duplicates.length > 0) issues.push(`дубли ${field}: ${duplicates.join(", ")}`);
  }
}

function validateReferences(database: Database, issues: string[]): void {
  const manufacturers = new Set(database.manufacturers.map((item) => item.manufacturer_id));
  const categories = new Set(database.categories.map((item) => item.category_id));
  const technologies = new Set(database.technologies.map((item) => item.technology_id));
  const glossLevels = new Set(database.gloss_levels.map((item) => item.gloss_id));
  const materials = new Set(database.materials.map((item) => item.material_id));
  const units = new Set(database.units.map((item) => item.unit_id));
  const methods = new Set(database.application_methods.map((item) => item.method_id));
  const substrates = new Set(database.substrates.map((item) => item.substrate_id));
  const documents = new Set(database.documents.map((item) => item.document_id));
  const documentTypes = new Set(database.document_types.map((item) => item.document_type_id));

  for (const material of database.materials) {
    if (!manufacturers.has(material.manufacturer_id)) {
      issues.push(`материал ${material.material_id}: неизвестный производитель ${material.manufacturer_id}`);
    }
    if (!categories.has(material.category_id)) {
      issues.push(`материал ${material.material_id}: неизвестная категория ${material.category_id}`);
    }
    if (material.technology_id !== null && !technologies.has(material.technology_id)) {
      issues.push(`материал ${material.material_id}: неизвестная технология ${material.technology_id}`);
    }
    if (material.gloss_id !== null && !glossLevels.has(material.gloss_id)) {
      issues.push(`материал ${material.material_id}: неизвестный уровень блеска ${material.gloss_id}`);
    }
  }

  for (const relation of database.material_substrates) {
    if (!materials.has(relation.material_id)) {
      issues.push(`связь ${relation.material_substrate_id}: неизвестный материал ${relation.material_id}`);
    }
    if (!substrates.has(relation.substrate_id)) {
      issues.push(`связь ${relation.material_substrate_id}: неизвестная поверхность ${relation.substrate_id}`);
    }
  }

  for (const norm of database.consumption_norms) {
    if (!materials.has(norm.material_id)) issues.push(`норма ${norm.norm_id}: неизвестный материал`);
    if (!units.has(norm.unit_id)) issues.push(`норма ${norm.norm_id}: неизвестная единица ${norm.unit_id}`);
    if (!methods.has(norm.application_method_id)) issues.push(`норма ${norm.norm_id}: неизвестный метод нанесения`);
    if (!substrates.has(norm.substrate_id)) issues.push(`норма ${norm.norm_id}: неизвестное основание`);
    if (!documents.has(norm.source_document_id)) issues.push(`норма ${norm.norm_id}: неизвестный документ-источник`);
    if (!Number.isFinite(norm.value_nominal) || norm.value_nominal <= 0) {
      issues.push(`норма ${norm.norm_id}: value_nominal должен быть положительным числом`);
    }
  }

  for (const document of database.documents) {
    if (!materials.has(document.material_id)) issues.push(`документ ${document.document_id}: неизвестный материал`);
    if (!documentTypes.has(document.document_type_id)) issues.push(`документ ${document.document_id}: неизвестный тип документа`);
  }

  for (const relation of database.material_substrates) {
    if (relation.source_import_batch_id != null && !database.import_batches.some(
      (batch) => batch.import_batch_id === relation.source_import_batch_id,
    )) {
      issues.push(`связь ${relation.material_substrate_id}: неизвестный пакет импорта ${relation.source_import_batch_id}`);
    }
  }
}

function validateDefaultNorms(database: Database, issues: string[]): void {
  const contexts = new Set<string>();
  for (const norm of database.consumption_norms) {
    if (norm.status !== "active" || !norm.is_default) continue;
    const key = [
      norm.material_id,
      norm.application_method_id,
      norm.substrate_id,
      norm.dry_film_thickness_um ?? "null",
    ].join("|");
    if (contexts.has(key)) issues.push(`дублирующая default-норма для контекста ${key}`);
    contexts.add(key);
  }
}

function validateImportBatches(database: Database, issues: string[]): void {
  for (const batch of database.import_batches) {
    const counts = [batch.rows_total, batch.rows_imported, batch.rows_rejected];
    if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
      issues.push(`пакет импорта ${batch.import_batch_id}: счётчики строк должны быть целыми и неотрицательными`);
    }
    if (batch.rows_imported + batch.rows_rejected !== batch.rows_total) {
      issues.push(`пакет импорта ${batch.import_batch_id}: rows_imported + rows_rejected не равно rows_total`);
    }
  }
}
