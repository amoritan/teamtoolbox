interface ImportMetaEnv {
  /** Set by scripts/tool-app-vite.ts: production, staging (previews) or local services. */
  readonly TTB_ROOMS_URL: string
  readonly TTB_ADS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
