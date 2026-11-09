/** Creating and opening retro rooms, with the app's schemas and service URLs. */

import type { LifetimeDays } from '@teamtoolbox/protocol'
import { createRoom, openRoom, type Room } from '@teamtoolbox/room-client'
import { rememberRoom, roomMemory, saveName, saveRoomMemory } from '../model/local'
import { type Presence, presenceSchema, type RetroRecord, recordSchema } from '../model/schema'
import { TEMPLATES, type TemplateId } from '../model/templates'

export type RetroRoom = Room<RetroRecord, Presence>

const options = () => ({
  tool: 'retro',
  recordSchema,
  presenceSchema,
  roomsUrl: import.meta.env.TTB_ROOMS_URL,
  appOrigin: location.origin,
})

export async function createRetro(
  templateId: TemplateId,
  lifetimeDays: LifetimeDays,
  name: string,
): Promise<RetroRoom> {
  const room = await createRoom<RetroRecord, Presence>({ ...options(), lifetimeDays })
  const now = Date.now()
  const pid = room.newRecordId()
  saveName(name)
  saveRoomMemory(room.roomId, { pid, voterId: null, ownCards: [] })

  await room.put(room.newRecordId(), { k: 'settings', template: templateId, createdAt: now })
  await room.put(room.newRecordId(), {
    k: 'state',
    phase: 'lobby',
    hostId: pid,
    timer: null,
    focusTopicId: null,
  })
  await room.put(pid, { k: 'person', name, joinedAt: now })
  await room.setPresence({ pid, name, typing: false })

  rememberRoom({
    link: room.link,
    roomId: room.roomId,
    templateName: TEMPLATES[templateId].name,
    createdAt: room.meta?.createdAt ?? now,
    expiresAt: room.meta?.expiresAt ?? now + lifetimeDays * 86_400_000,
    hosted: true,
  })
  return room
}

export function openRetro(link: string): Promise<RetroRoom> {
  return openRoom<RetroRecord, Presence>({ ...options(), link })
}

export { roomMemory }
