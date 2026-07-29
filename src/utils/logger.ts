import type { Database } from "../types/database";

export function logDatabaseSummary(database: Database): void {
  console.info("PROFiGYM: база загружена", {
    version: database.metadata.schema_version,
    datasetType: database.metadata.dataset_type,
    manufacturers: database.manufacturers.length,
    materials: database.materials.length,
    norms: database.consumption_norms.length,
    documents: database.documents.length,
  });

  if (database.metadata.dataset_type === "demo" || database.metadata.is_demo) {
    console.warn("PROFiGYM: используется демонстрационная база данных.");
  }
}
