/**
 * What this browser remembers, in localStorage on retro.teamtoolbox.org. Safe there
 * only because no third-party code runs on this origin (tech-spec §5.6). Every read
 * and write survives storage being unavailable, e.g. in a private window.
 */

const NAME_KEY = 'ttb.retro.name'
const RECENT_KEY = 'ttb.retro.recent'
const roomKey = (roomId: string) => `ttb.retro.room.${roomId}`
const MAX_RECENT = 10

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the retro still works, it just won't remember.
  }
}

export function savedName(): string {
  const name = read<string>(NAME_KEY)
  return typeof name === 'string' ? name : ''
}

export function saveName(name: string): void {
  write(NAME_KEY, name)
}

export interface RoomMemory {
  /** Your participant ID in this room. */
  pid: string | null
  /** Your ballot's record ID. Separate from `pid`, so votes can't be traced to you. */
  voterId: string | null
  /** The cards you wrote, so you can edit them. Cards themselves carry no author. */
  ownCards: string[]
}

export function roomMemory(roomId: string): RoomMemory {
  const stored = read<Partial<RoomMemory>>(roomKey(roomId))
  return {
    pid: typeof stored?.pid === 'string' ? stored.pid : null,
    voterId: typeof stored?.voterId === 'string' ? stored.voterId : null,
    ownCards: Array.isArray(stored?.ownCards)
      ? stored.ownCards.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

export function saveRoomMemory(roomId: string, memory: RoomMemory): void {
  write(roomKey(roomId), memory)
}

export interface RecentRoom {
  link: string
  roomId: string
  templateName: string
  createdAt: number
  expiresAt: number
  hosted: boolean
}

export function recentRooms(now = Date.now()): RecentRoom[] {
  const list = read<RecentRoom[]>(RECENT_KEY)
  if (!Array.isArray(list)) return []
  return list.filter(
    (room) =>
      typeof room?.link === 'string' &&
      typeof room.roomId === 'string' &&
      typeof room.expiresAt === 'number' &&
      room.expiresAt > now,
  )
}

export function rememberRoom(room: RecentRoom): void {
  const others = recentRooms().filter((existing) => existing.roomId !== room.roomId)
  write(RECENT_KEY, [room, ...others].slice(0, MAX_RECENT))
}

export function forgetRoom(roomId: string): void {
  write(
    RECENT_KEY,
    recentRooms().filter((room) => room.roomId !== roomId),
  )
  try {
    localStorage.removeItem(roomKey(roomId))
  } catch {
    // Nothing to clean up.
  }
}
