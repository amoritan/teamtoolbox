import { exports } from 'cloudflare:workers'
import { parseAd } from '@teamtoolbox/protocol'
import { describe, expect, it } from 'vitest'
import { houseAds } from '../src/inventory'

const ORIGIN = 'https://retro.teamtoolbox.org'

function slot(tool: string, origin: string | null = ORIGIN) {
  return exports.default.fetch(`https://ads.teamtoolbox.org/v1/slot?tool=${tool}`, {
    headers: origin ? { Origin: origin } : {},
  })
}

describe('GET /v1/slot', () => {
  it('returns a valid ad with CORS for the tool origin', async () => {
    const response = await slot('retro')
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const ad = parseAd(await response.json())
    expect(ad).not.toBeNull()
    expect(ad?.href).toMatch(/^https:\/\/ads\.teamtoolbox\.org\/v1\/c\/[a-z0-9-]+\?tool=retro$/)
  })

  it('refuses other origins', async () => {
    const response = await slot('retro', 'https://evil.example')
    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it("refuses another tool's origin", async () => {
    expect((await slot('retro', 'https://healthcheck.teamtoolbox.org')).status).toBe(403)
  })

  it('returns 404 for unknown tools', async () => {
    expect((await slot('nope')).status).toBe(404)
  })
})

describe('GET /v1/c/:id', () => {
  it('redirects to the ad target without a referrer', async () => {
    const [first] = houseAds
    if (!first) throw new Error('No house ads')
    const response = await exports.default.fetch(
      `https://ads.teamtoolbox.org/v1/c/${first.id}?tool=retro`,
      { redirect: 'manual' },
    )
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(first.target)
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('never redirects to anything outside the inventory', async () => {
    const response = await exports.default.fetch('https://ads.teamtoolbox.org/v1/c/not-an-ad', {
      redirect: 'manual',
    })
    expect(response.status).toBe(404)
  })
})

describe('other requests', () => {
  it('only allows GET', async () => {
    const response = await exports.default.fetch('https://ads.teamtoolbox.org/v1/slot?tool=retro', {
      method: 'POST',
    })
    expect(response.status).toBe(405)
  })
})
