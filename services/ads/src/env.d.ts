declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index')
  }

  interface Env {
    /** Missing in some local setups, so the code treats it as optional. */
    AD_EVENTS?: AnalyticsEngineDataset
    /** Comma-separated host suffixes allowed as origins besides <tool>.teamtoolbox.org. */
    ALLOWED_HOST_SUFFIXES?: string
  }
}
