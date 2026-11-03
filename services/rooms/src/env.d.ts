declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index')
    durableNamespaces: 'Room'
  }

  interface Env {
    ROOM: DurableObjectNamespace<import('./room').Room>
    /** Missing in some local setups, so the code treats it as optional. */
    CONNECT_LIMITER?: RateLimit
    /** Comma-separated host suffixes allowed as origins besides <tool>.teamtoolbox.org. */
    ALLOWED_HOST_SUFFIXES?: string
    /** "none" only for local dev and tests, which can't do jurisdictions. Anything else means EU. */
    ROOM_JURISDICTION?: string
  }
}
