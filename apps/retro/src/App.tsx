import { getTool } from '@teamtoolbox/registry'
import { AppShell } from '@teamtoolbox/ui'
import { useEffect, useState } from 'react'
import type { RetroRoom } from './room/connect'
import { RoomScreen } from './room/RoomScreen'
import { StartScreen } from './StartScreen'

const tool = getTool('retro')
if (!tool) throw new Error('retro is missing from the registry')

type Route = { kind: 'start' } | { kind: 'room'; link: string; room: RetroRoom | null }

const routeFromLocation = (): Route =>
  location.pathname === '/room'
    ? { kind: 'room', link: location.href, room: null }
    : { kind: 'start' }

export function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation)

  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation())
    addEventListener('popstate', onPopState)
    return () => removeEventListener('popstate', onPopState)
  }, [])

  return (
    <AppShell tool={tool as NonNullable<typeof tool>} adsUrl={import.meta.env.TTB_ADS_URL}>
      {route.kind === 'start' ? (
        <StartScreen
          onCreated={(room) => {
            // The secret stays in the fragment, which browsers never send anywhere.
            history.pushState(null, '', room.link)
            setRoute({ kind: 'room', link: room.link, room })
          }}
          onOpen={(link) => {
            history.pushState(null, '', link)
            setRoute({ kind: 'room', link, room: null })
          }}
        />
      ) : (
        <RoomScreen
          key={route.link}
          link={route.link}
          initialRoom={route.room}
          onLeave={() => {
            history.pushState(null, '', '/')
            setRoute({ kind: 'start' })
          }}
        />
      )}
    </AppShell>
  )
}
