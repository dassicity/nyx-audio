import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar.js'
import { PlayerBar } from './PlayerBar.js'
import { NowPlaying } from './NowPlaying.js'
import { QueuePanel } from './QueuePanel.js'
import { AmbientDisplay } from './AmbientDisplay.js'
import { CommandPalette } from './CommandPalette.js'
import { KeyboardOverlay } from './KeyboardOverlay.js'
import { WASH_OPACITY } from '../palette/palette.js'
import { usePlayer } from '../player.js'

/** Album detail and crate flood the wash; everything else keeps it subtle.
 *  See safeTextOnWash — this opacity decides which text tokens are legal. */
function washOpacity(pathname: string): number {
  return /^\/album\/|^\/crate/.test(pathname)
    ? WASH_OPACITY.flooded
    : WASH_OPACITY.normal
}

export function Shell() {
  const { pathname } = useLocation()
  const [nowPlaying, setNowPlaying] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [ambient, setAmbient] = useState(false)
  const [oledSafe, setOledSafe] = useState(false)
  const [palette, setPalette] = useState(false)
  const [keys, setKeys] = useState(false)
  const navigate = useNavigate()
  const engine = usePlayer((s) => s.engine)

  const toggleNowPlaying = useCallback(() => setNowPlaying((v) => !v), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The palette is the one shortcut that must work while typing.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
        return
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '?') { e.preventDefault(); setKeys((v) => !v); return }
      if (e.key === '/') { e.preventDefault(); navigate('/search'); return }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault()
          void engine?.toggle()
          break
        case 'n': toggleNowPlaying(); break
        case 'q': setQueueOpen((v) => !v); break
        case 'd': setAmbient((v) => !v); break
        case 'escape':
          setQueueOpen(false); setNowPlaying(false)
          setPalette(false); setKeys(false); setAmbient(false)
          break
        case 'arrowright':
          if (!nowPlaying) { e.preventDefault(); void engine?.seek(usePlayer.getState().position + 5) }
          break
        case 'arrowleft':
          if (!nowPlaying) { e.preventDefault(); void engine?.seek(usePlayer.getState().position - 5) }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, nowPlaying, toggleNowPlaying, navigate])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background:
                'radial-gradient(120% 70% at 15% 0%, var(--nyx-art-wash), transparent 70%)',
              opacity: washOpacity(pathname),
              transition: 'opacity var(--nyx-dur-slow) var(--nyx-ease)',
            }}
          />
          <div style={{ position: 'relative', height: '100%', overflowY: 'auto' }}>
            <Outlet />
          </div>
          <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
        </main>
      </div>
      <PlayerBar
        onExpand={toggleNowPlaying}
        onToggleQueue={() => setQueueOpen((v) => !v)}
      />
      <NowPlaying open={nowPlaying} onClose={() => setNowPlaying(false)} />
      <AmbientDisplay
        open={ambient} onClose={() => setAmbient(false)}
        oledSafe={oledSafe} onToggleSafe={() => setOledSafe((v) => !v)}
      />
      <CommandPalette
        open={palette} onClose={() => setPalette(false)}
        onAmbient={() => setAmbient(true)}
        onNowPlaying={toggleNowPlaying}
        onQueue={() => setQueueOpen(true)}
        onKeys={() => setKeys(true)}
      />
      <KeyboardOverlay open={keys} onClose={() => setKeys(false)} />
    </div>
  )
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}
