import { parseAd } from '@teamtoolbox/protocol'
import { getTool, isAllowedToolOrigin } from '@teamtoolbox/registry'
import { findInventoryAd, inventory } from './inventory'
import { networks } from './networks'
import { selectAd } from './select'

function count(
  env: Cloudflare.Env,
  event: 'impression' | 'click',
  adId: string,
  tool: string,
): void {
  env.AD_EVENTS?.writeDataPoint({ blobs: [event, adId, tool], doubles: [1], indexes: [adId] })
}

function json(body: unknown, status: number, origin: string | null): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  })
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  return new Response(JSON.stringify(body), { status, headers })
}

async function slot(request: Request, env: Cloudflare.Env, url: URL): Promise<Response> {
  const tool = getTool(url.searchParams.get('tool') ?? '')
  if (!tool) return json({ error: 'unknown_tool' }, 404, null)

  const origin = request.headers.get('Origin')
  const allowed = isAllowedToolOrigin(origin, tool.slug, env.ALLOWED_HOST_SUFFIXES)
  if (origin && !allowed) return json({ error: 'forbidden' }, 403, null)

  const ad = await selectAd({ tool, inventory, networks, clickBase: url.origin })
  // Everything we hand to the browser must pass the same schema the slot checks.
  const valid = ad && parseAd(ad)
  if (!valid) return json({ error: 'no_ad' }, 404, allowed ? origin : null)

  count(env, 'impression', valid.id, tool.slug)
  return json(valid, 200, allowed ? origin : null)
}

function click(env: Cloudflare.Env, url: URL, adId: string): Response {
  // Only ever redirect to our own inventory, so this is never an open redirect.
  const ad = findInventoryAd(adId)
  if (!ad) return new Response('Not found', { status: 404 })
  const tool = getTool(url.searchParams.get('tool') ?? '')
  count(env, 'click', ad.id, tool?.slug ?? 'unknown')
  return new Response(null, {
    status: 302,
    headers: { Location: ad.target, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    if (url.pathname === '/health') return new Response('ok')
    if (url.pathname === '/v1/slot') return slot(request, env, url)
    const clickMatch = /^\/v1\/c\/([a-z0-9-]{1,64})$/.exec(url.pathname)
    if (clickMatch?.[1]) return click(env, url, clickMatch[1])
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Cloudflare.Env>
