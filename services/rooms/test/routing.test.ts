import { describe, expect, it } from 'vitest'
import { parseRoomPath } from '../src/routing'

const ROOM_ID = 'AbCdEfGhIjKlMnOpQrStUv'

describe('parseRoomPath', () => {
  it('reads the tool and room ID', () => {
    expect(parseRoomPath(`/v1/retro/${ROOM_ID}`)).toEqual({ tool: 'retro', roomId: ROOM_ID })
  })

  it('rejects anything else', () => {
    for (const path of [
      '/',
      `/v2/retro/${ROOM_ID}`,
      `/v1/Retro/${ROOM_ID}`,
      '/v1/retro/short',
      `/v1/retro/${ROOM_ID}/extra`,
      `/v1/-retro/${ROOM_ID}`,
    ]) {
      expect(parseRoomPath(path)).toBeNull()
    }
  })
})
