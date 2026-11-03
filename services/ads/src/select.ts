import type { Ad } from '@teamtoolbox/protocol'
import type { Tool } from '@teamtoolbox/registry'
import type { Inventory, InventoryAd } from './inventory'
import type { AdNetwork } from './networks'

/** How long a network gets before we fall back to a house ad. */
export const NETWORK_TIMEOUT_MS = 300

export function isActive(ad: InventoryAd, tool: string, now: Date): boolean {
  if (ad.tools?.length && !ad.tools.includes(tool)) return false
  if (ad.startsAt && now < new Date(ad.startsAt)) return false
  if (ad.endsAt && now >= new Date(ad.endsAt)) return false
  return true
}

export interface SelectOptions {
  tool: Tool
  inventory: Inventory
  networks: readonly AdNetwork[]
  /** Base URL of this service, used to build click-counting links. */
  clickBase: string
  now?: Date
  random?: () => number
}

function pick<T>(items: readonly T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)]
}

function fromInventory(ad: InventoryAd, kind: 'sponsor' | 'house', options: SelectOptions): Ad {
  const href = new URL(`/v1/c/${ad.id}`, options.clickBase)
  href.searchParams.set('tool', options.tool.slug)
  return {
    id: ad.id,
    kind,
    label: ad.label,
    title: ad.title,
    body: ad.body,
    href: href.toString(),
    ...(ad.image ? { image: ad.image } : {}),
  }
}

async function fromNetworks(options: SelectOptions): Promise<Ad | null> {
  for (const network of options.networks) {
    try {
      const ad = await network.fetchAd(
        { tool: options.tool },
        AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      )
      if (ad) return { ...ad, kind: 'network' }
    } catch {
      // A slow or failing network never blocks the slot.
    }
  }
  return null
}

/** Sponsor first, then a network ad, then a house ad. */
export async function selectAd(options: SelectOptions): Promise<Ad | null> {
  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const slug = options.tool.slug

  const sponsor = pick(
    options.inventory.sponsors.filter((ad) => isActive(ad, slug, now)),
    random,
  )
  if (sponsor) return fromInventory(sponsor, 'sponsor', options)

  const network = await fromNetworks(options)
  if (network) return network

  const house = pick(
    options.inventory.houseAds.filter((ad) => isActive(ad, slug, now)),
    random,
  )
  return house ? fromInventory(house, 'house', options) : null
}
