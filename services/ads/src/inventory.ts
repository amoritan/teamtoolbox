/**
 * Ads we serve ourselves. Everything here is public anyway (it's what people
 * see), so prices and contracts never go in this file.
 */
import { SITE_LINKS, toolOrigin, tools } from '@teamtoolbox/registry'

export interface InventoryAd {
  id: string
  label: string
  title: string
  body: string
  /** Where a click goes, via our click counter. */
  target: string
  image?: { src: string; width: number; height: number; alt: string }
  /** Tool slugs to show this on. Empty or missing means every tool. */
  tools?: readonly string[]
  /** ISO dates, inclusive start and exclusive end. */
  startsAt?: string
  endsAt?: string
}

/** Direct sponsorships, e.g. "Retro is sponsored by …". None booked yet. */
export const sponsors: readonly InventoryAd[] = []

const HOUSE_LABEL = 'From teamtoolbox'

const generalHouseAds: readonly InventoryAd[] = [
  {
    id: 'house-directory',
    label: HOUSE_LABEL,
    title: 'More free tools for your team',
    body: 'Private by design, no sign-up. See the whole toolbox.',
    target: SITE_LINKS.home,
  },
  {
    id: 'house-suggest',
    label: HOUSE_LABEL,
    title: 'Missing a tool?',
    body: 'Tell us what your team needs next.',
    target: `${SITE_LINKS.home}about#suggest`,
  },
  {
    id: 'house-source',
    label: HOUSE_LABEL,
    title: "Don't take our word for it",
    body: 'teamtoolbox is open source. See how your data stays private.',
    target: SITE_LINKS.security,
  },
]

/** House ads promoting the tools that are already usable. */
const toolHouseAds: readonly InventoryAd[] = tools
  .filter((tool) => tool.status !== 'soon')
  .map((tool) => ({
    id: `house-tool-${tool.slug}`,
    label: HOUSE_LABEL,
    title: `Try ${tool.name}`,
    body: tool.tagline,
    target: toolOrigin(tool.slug),
    tools: tools.filter((other) => other.slug !== tool.slug).map((other) => other.slug),
  }))

export const houseAds: readonly InventoryAd[] = [...generalHouseAds, ...toolHouseAds]

export interface Inventory {
  sponsors: readonly InventoryAd[]
  houseAds: readonly InventoryAd[]
}

export const inventory: Inventory = { sponsors, houseAds }

export function findInventoryAd(id: string, from: Inventory = inventory): InventoryAd | undefined {
  return [...from.sponsors, ...from.houseAds].find((ad) => ad.id === id)
}
