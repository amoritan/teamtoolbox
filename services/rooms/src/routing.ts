import { ROOM_ID_PATTERN } from '@teamtoolbox/protocol'
import { TOOL_SLUG_PATTERN } from '@teamtoolbox/registry'

export interface RoomRoute {
  tool: string
  roomId: string
}

/** `/v1/<tool>/<roomId>` → the room's address, or null. */
export function parseRoomPath(pathname: string): RoomRoute | null {
  const match = /^\/v1\/([^/]+)\/([^/]+)$/.exec(pathname)
  const tool = match?.[1]
  const roomId = match?.[2]
  if (!tool || !roomId || !TOOL_SLUG_PATTERN.test(tool) || !ROOM_ID_PATTERN.test(roomId))
    return null
  return { tool, roomId }
}
