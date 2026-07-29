interface ImportMetaEnvironment { VITE_DATABASE_URL?: string; }
const environment = (import.meta as ImportMeta & { env?: ImportMetaEnvironment }).env;
const configuredUrl = environment?.VITE_DATABASE_URL?.trim();
export const DATABASE_URL = configuredUrl || "/data/database.json";
