import { isAllowedToolOrigin } from '@teamtoolbox/registry'
import { parseRoomPath } from './routing'

export { Room } from './room'

/**
 * Rooms are pinned to the EU: the Durable Object runs and stores its data there.
 * Local runtimes can't do jurisdictions, so dev and tests opt out explicitly.
 * A missing setting means EU.
 */
function roomNamespace(env: Cloudflare.Env) {
  return env.ROOM_JURISDICTION === 'none' ? env.ROOM : env.ROOM.jurisdiction('eu')
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') return new Response('ok')

    const route = parseRoomPath(url.pathname)
    if (!route) return new Response('Not found', { status: 404 })

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }
    if (
      !isAllowedToolOrigin(request.headers.get('Origin'), route.tool, env.ALLOWED_HOST_SUFFIXES)
    ) {
      return new Response('Forbidden', { status: 403 })
    }

    const ip = request.headers.get('CF-Connecting-IP')
    if (ip && env.CONNECT_LIMITER) {
      const { success } = await env.CONNECT_LIMITER.limit({ key: ip })
      if (!success) return new Response('Too many connections', { status: 429 })
    }

    const rooms = roomNamespace(env)
    return rooms.get(rooms.idFromName(`${route.tool}:${route.roomId}`)).fetch(request)
  },
} satisfies ExportedHandler<Cloudflare.Env>
