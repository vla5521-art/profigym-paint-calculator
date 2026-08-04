interface ImportMetaEnv {
  readonly PROD: boolean;
  readonly VITE_CAD_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
