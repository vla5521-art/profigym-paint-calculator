export const LEGACY_MATERIAL_DATABASE_NAME = "profigym-user-database";
export const MATERIAL_DATABASE_CLEANUP_MARKER =
  "profigym:migrations:material-db-cleanup:v1";
export const MATERIAL_DATABASE_CLEANUP_MARKER_VALUE = "completed";

export type MaterialDatabaseCleanupResult =
  | "already-completed"
  | "completed"
  | "blocked"
  | "error"
  | "unavailable";

function warnLegacyCleanup(message: string): void {
  console.warn(`Legacy material database cleanup: ${message}`);
}

export function cleanupMaterialDatabase(): Promise<MaterialDatabaseCleanupResult> {
  if (typeof window === "undefined") {
    return Promise.resolve("unavailable");
  }

  let storage: Storage;
  let databaseFactory: IDBFactory;

  try {
    storage = window.localStorage;
    if (
      storage.getItem(MATERIAL_DATABASE_CLEANUP_MARKER) ===
      MATERIAL_DATABASE_CLEANUP_MARKER_VALUE
    ) {
      return Promise.resolve("already-completed");
    }

    databaseFactory = window.indexedDB;
    if (!databaseFactory) {
      warnLegacyCleanup("IndexedDB is unavailable; cleanup will be retried.");
      return Promise.resolve("unavailable");
    }
  } catch {
    warnLegacyCleanup(
      "browser storage is unavailable; cleanup will be retried.",
    );
    return Promise.resolve("unavailable");
  }

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;

    try {
      request = databaseFactory.deleteDatabase(LEGACY_MATERIAL_DATABASE_NAME);
    } catch {
      warnLegacyCleanup("database deletion could not be started.");
      resolve("error");
      return;
    }

    let settled = false;
    const finish = (result: MaterialDatabaseCleanupResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    request.onsuccess = () => {
      if (settled) return;

      try {
        storage.setItem(
          MATERIAL_DATABASE_CLEANUP_MARKER,
          MATERIAL_DATABASE_CLEANUP_MARKER_VALUE,
        );
        finish("completed");
      } catch {
        warnLegacyCleanup(
          "completion marker could not be stored; cleanup will be retried.",
        );
        finish("error");
      }
    };

    request.onerror = () => {
      warnLegacyCleanup("database deletion failed; cleanup will be retried.");
      finish("error");
    };

    request.onblocked = () => {
      warnLegacyCleanup("database deletion was blocked; cleanup will be retried.");
      finish("blocked");
    };
  });
}
