/**
 * Server-side adapters for ad networks with a JSON ad API (EthicalAds, Carbon).
 * The browser never talks to a network directly, except to load the ad's image
 * and view pixel. None are enabled until a network approves the site.
 */
import type { Ad } from '@teamtoolbox/protocol'
import type { Tool } from '@teamtoolbox/registry'

export interface AdNetwork {
  name: string
  /** Returns null when the network has nothing to show. Must respect `signal`. */
  fetchAd(request: { tool: Tool }, signal: AbortSignal): Promise<Ad | null>
}

export const networks: readonly AdNetwork[] = []
