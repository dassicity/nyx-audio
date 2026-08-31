import { useEffect, useState } from 'react'
import { SubsonicClient } from './api/subsonic.js'
import { loadCredentials, clearCredentials } from './auth.js'
import { Login } from './components/Login.js'
import { PlayerBar } from './components/PlayerBar.js'
import { Albums } from './screens/Albums.js'
import { usePlayer } from './player.js'

export function App() {
  const [client, setClient] = useState<SubsonicClient | null>(null)
  const attach = usePlayer((s) => s.attach)

  useEffect(() => {
    const saved = loadCredentials()
    if (saved) setClient(new SubsonicClient(saved))
  }, [])

  useEffect(() => { if (client) attach(client) }, [client, attach])

  if (!client) return <Login onAuthed={setClient} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav style={{
          width: 232, flex: 'none', background: 'var(--nyx-bg-1)',
          borderRight: '1px solid var(--nyx-line)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '22px 18px 16px' }}>
            <div className="display" style={{ fontSize: 26, letterSpacing: '0.14em' }}>NYX</div>
            <div style={{ borderTop: '1px solid var(--nyx-line)', margin: '8px 0 6px' }} />
            <div className="eyebrow" style={{ textAlign: 'right' }}>Audio</div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{
            padding: 14, borderTop: '1px solid var(--nyx-line)',
          }}>
            <button
              onClick={() => { clearCredentials(); setClient(null) }}
              className="mono"
              style={{ fontSize: 10, color: 'var(--nyx-txt-3)' }}
            >sign out</button>
          </div>
        </nav>

        <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          <Albums client={client} />
        </main>
      </div>
      <PlayerBar />
    </div>
  )
}
