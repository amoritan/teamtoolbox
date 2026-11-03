import { ROOT_DOMAIN } from './domain'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Whether a browser `Origin` belongs to the given tool. Our services use this to
 * stop other websites from calling them. It isn't access control, since non-browser
 * clients can send any Origin.
 *
 * `extraSuffixes` is a comma-separated list of host suffixes to also allow, for
 * local development (`localhost`) and preview deployments (`.workers.dev`).
 */
export function isAllowedToolOrigin(
  origin: string | null,
  tool: string,
  extraSuffixes = '',
): boolean {
  if (!origin) return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  const isLocal = LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) return false
  if (url.protocol === 'https:' && url.hostname === `${tool}.${ROOT_DOMAIN}`) return true
  return extraSuffixes
    .split(',')
    .map((suffix) => suffix.trim().replace(/^\./, ''))
    .filter(Boolean)
    .some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`))
}
