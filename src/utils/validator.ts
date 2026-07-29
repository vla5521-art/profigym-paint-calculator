import type { Database } from "../types/database";

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

const requiredArrays = [
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

export function parseAndValidateDatabase(value: unknown): Database {
  const issues: string[] = [];

  if (!isRecord(value)) {
    throw new DatabaseValidationError(["корневое значение JSON должно быть объектом"]);
  }

  if (!isRecord(value.metadata)) {
    issues.push("отсутствует объект metadata");
  }

  for (const section of requiredArrays) {
    if (!Array.isArray(value[section])) {
      issues.push(`отсутствует массив ${section}`);
    }
  }

  if (issues.length > 0) {
    throw new DatabaseValidationError(issues);
  }

  const database = value as unknown as Database;
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

  validateUniqueIds(database, issues);
  validateReferences(database, issues);
  validateDefaultNorms(database, issues);

  if (issues.length > 0) {
    throw new DatabaseValidationError(issues);
  }
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
    ["norm_id", database.consumption_norms.map((item) => item.norm_id)],
    ["document_id", database.documents.map((item) => item.document_id)],
  ];

  for (const [field, values] of checks) {
    const duplicates = findDuplicates(values);
    if (duplicates.length > 0) {
      issues.push(`дубли ${field}: ${duplicates.join(", ")}`);
    }
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
