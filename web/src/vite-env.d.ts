/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API origin for a production static deploy (e.g. Vercel). Unset in local dev, where
   * Vite's own proxy (see vite.config.ts) forwards "/api" to the local server instead. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
