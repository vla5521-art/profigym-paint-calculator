const configuredUrl = import.meta.env.VITE_DATABASE_URL as string | undefined;

/** Единственная точка настройки источника данных. */
export const DATABASE_URL = configuredUrl?.trim() || "/data/database.json";
