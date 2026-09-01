import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { usePlayer } from '../player.js'
import { useClient } from '../api/context.js'
import { NowPlaying } from './NowPlaying.js'
import { px } from '../format.js'

const TABS = [
  { code: 'TD', label: 'Today', to: '/' },
  { code: 'AL', label: 'Albums', to: '/albums' },
  { code: 'SR', label: 'Search', to: '/search' },
  { code: 'CR', label: 'Crate', to: '/crate' },
  { code: 'ST', label: 'Settings', to: '/settings' },
] as const

/**
 * Bottom stack: mini-player, a 2px progress line, then the tab bar. Dragging
 * the mini-player up past ~35% of the screen commits to Now Playing; below
 * that it springs back. Tap does the same instantly.
 */
export function MobileShell() {
  const { queue, index, status, position, duration: dur, engine } = usePlayer()
  const client = useClient()
  const [nowPlaying, setNowPlaying] = useState(false)
  const [dragY, setDragY] = useState(0)

  const track = queue[index]
  const pct = dur > 0 ? (position / dur) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative' }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(120% 60% at 20% 0%, var(--nyx-art-wash), transparent 70%)',
          opacity: 0.4,
        }} />
        <div style={{ position: 'relative', padding: 'var(--nyx-pad-screen-mobile)' }}>
          <Outlet />
        </div>
      </main>

      {track && (
        <div
          onClick={() => setNowPlaying(true)}
          onTouchMove={(e) => {
            const t = e.touches[0]
            if (t) setDragY(Math.max(0, window.innerHeight - t.clientY))
          }}
          onTouchEnd={() => {
            if (dragY > window.innerHeight * 0.35) setNowPlaying(true)
            setDragY(0)
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderTop: '1px solid var(--nyx-line)',
            background: 'var(--nyx-bg-1)', flex: 'none',
            transform: dragY > 0 ? `translateY(${-Math.min(dragY, 120) / 4}px)` : 'none',
          }}
        >
          <img src={client.coverArtUrl(track.id, 88)} alt="" style={{
            width: 44, height: 44, flex: 'none', objectFit: 'cover',
            borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="display" style={{
              fontSize: px(14), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{track.title}</div>
            <div style={{
              fontSize: px(11), color: 'var(--nyx-txt-3)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{track.artist}</div>
          </div>
          <button
            aria-label={status === 'playing' ? 'Pause' : 'Play'}
            onClick={(e) => { e.stopPropagation(); void engine?.toggle() }}
            style={{ width: 44, height: 44, flex: 'none', fontSize: px(15) }}
          >{status === 'playing' ? '❙❙' : '▶'}</button>
        </div>
      )}

      {track && (
        <div aria-hidden style={{ height: 2, background: 'var(--nyx-bg-3)', flex: 'none' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--nyx-art-bar)' }} />
        </div>
      )}

      <nav style={{
        display: 'flex', flex: 'none',
        padding: '6px 4px calc(22px + env(safe-area-inset-bottom))',
        borderTop: '1px solid var(--nyx-line)', background: 'var(--nyx-bg-1)',
      }}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to} to={tab.to} end={tab.to === '/'}
            style={({ isActive }) => ({
              flex: 1, minHeight: 48, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              textDecoration: 'none', borderRadius: 'var(--nyx-r-2)',
              background: isActive ? 'var(--nyx-bg-2)' : 'transparent',
              color: isActive ? 'var(--nyx-txt-1)' : 'var(--nyx-txt-3)',
            })}
          >
            <span className="mono" style={{ fontSize: 'var(--nyx-t-mono-xs)' }}>{tab.code}</span>
            <span style={{ fontSize: px(10) }}>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      <NowPlaying open={nowPlaying} onClose={() => setNowPlaying(false)} />
    </div>
  )
}
