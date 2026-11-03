import type { Ad } from '@teamtoolbox/protocol'
import { getTool } from '@teamtoolbox/registry'
import { describe, expect, it } from 'vitest'
import type { Inventory, InventoryAd } from '../src/inventory'
import type { AdNetwork } from '../src/networks'
import { isActive, selectAd } from '../src/select'

const retro = (() => {
  const tool = getTool('retro')
  if (!tool) throw new Error('The registry must contain retro')
  return tool
})()
const clickBase = 'https://ads.teamtoolbox.org'
const now = new Date('2027-03-15T12:00:00Z')

const house: InventoryAd = {
  id: 'house-a',
  label: 'From teamtoolbox',
  title: 'House',
  body: 'House ad',
  target: 'https://teamtoolbox.org/',
}
const sponsor: InventoryAd = {
  id: 'sponsor-a',
  label: 'Sponsor',
  title: 'Sponsor',
  body: 'Sponsored',
  target: 'https://example.com/',
  startsAt: '2027-03-01',
  endsAt: '2027-04-01',
}
const networkAd: Ad = {
  id: 'net-1',
  kind: 'network',
  label: 'Ad',
  title: 'Network',
  body: 'From a network',
  href: 'https://network.example/click/1',
}

function network(result: () => Promise<Ad | null>): AdNetwork {
  return { name: 'test', fetchAd: result }
}

function select(inventory: Inventory, networks: AdNetwork[] = []) {
  return selectAd({ tool: retro, inventory, networks, clickBase, now, random: () => 0 })
}

describe('isActive', () => {
  it('respects date windows and target tools', () => {
    expect(isActive(sponsor, 'retro', now)).toBe(true)
    expect(isActive(sponsor, 'retro', new Date('2027-04-01T00:00:00Z'))).toBe(false)
    expect(isActive(sponsor, 'retro', new Date('2027-02-28T00:00:00Z'))).toBe(false)
    expect(isActive({ ...house, tools: ['healthcheck'] }, 'retro', now)).toBe(false)
    expect(isActive({ ...house, tools: [] }, 'retro', now)).toBe(true)
  })
})

describe('selectAd', () => {
  it('prefers an active sponsor and links through the click counter', async () => {
    const ad = await select({ sponsors: [sponsor], houseAds: [house] }, [
      network(async () => networkAd),
    ])
    expect(ad?.kind).toBe('sponsor')
    expect(ad?.href).toBe('https://ads.teamtoolbox.org/v1/c/sponsor-a?tool=retro')
  })

  it('falls back to a network ad, then a house ad', async () => {
    expect(
      (await select({ sponsors: [], houseAds: [house] }, [network(async () => networkAd)]))?.kind,
    ).toBe('network')
    expect(
      (await select({ sponsors: [], houseAds: [house] }, [network(async () => null)]))?.kind,
    ).toBe('house')
  })

  it('never lets a failing network block the slot', async () => {
    const failing = network(async () => {
      throw new Error('down')
    })
    expect((await select({ sponsors: [], houseAds: [house] }, [failing]))?.id).toBe('house-a')
  })

  it('returns null when there is nothing to show', async () => {
    expect(await select({ sponsors: [], houseAds: [] })).toBeNull()
  })
})
