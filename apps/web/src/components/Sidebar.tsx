import { NavLink } from 'react-router-dom'
import { useLibraryStats } from '../hooks/library.js'
import { usePlayer } from '../player.js'
import { duration, px } from '../format.js'

/** Two-letter mono codes, per the handoff. They double as the collapsed-rail
 *  labels, so the sidebar can narrow without losing its addressing. */
const NAV = [
  { code: 'TD', label: 'Today', to: '/' },
  { code: 'AL', label: 'Albums', to: '/albums', count: 'albums' },
  { code: 'SR', label: 'Search', to: '/search' },
  { code: 'AR', label: 'Artists', to: '/artists', count: 'artists' },
  { code: 'GN', label: 'Genres', to: '/genres', count: 'genres' },
  { code: 'PL', label: 'Playlists', to: '/playlists' },
  { code: 'FV', label: 'Favourites', to: '/favourites' },
  { code: 'CR', label: 'Crate', to: '/crate' },
  { code: 'ST', label: 'Statistics', to: '/stats' },
  { code: 'YR', label: 'Listening year', to: '/year' },
  { code: 'SE', label: 'Settings', to: '/settings' },
] as const

export function Sidebar() {
  const stats = useLibraryStats()
  const queueLength = usePlayer((s) => s.queue.length)

  const counts: Record<string, number> = {
    albums: stats.albums, artists: stats.artists, genres: stats.genres,
  }

  return (
    <nav style={{
      width: 'var(--nyx-rail-w)', flex: 'none',
      background: 'var(--nyx-bg-1)', borderRight: '1px solid var(--nyx-line)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ padding: '22px 18px 16px' }}>
        <div className="display" style={{
          fontSize: px(26), letterSpacing: '0.14em', lineHeight: 1,
        }}>NYX</div>
        <div style={{ borderTop: '1px solid var(--nyx-line)', margin: '9px 0 5px' }} />
        <div className="eyebrow" style={{ textAlign: 'right', letterSpacing: '0.22em' }}>
          Audio
        </div>
      </div>

      <div style={{
        padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 1,
        overflowY: 'auto', minHeight: 0,
      }}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              minHeight: 36, padding: '8px 10px',
              borderRadius: 'var(--nyx-r-2)', textDecoration: 'none',
              background: isActive ? 'var(--nyx-bg-2)' : 'transparent',
              color: isActive ? 'var(--nyx-txt-1)' : 'var(--nyx-txt-2)',
            })}
          >
            <span className="mono" style={{
              width: 20, fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
            }}>{item.code}</span>
            <span style={{ flex: 1, fontSize: 'var(--nyx-t-body-md)' }}>{item.label}</span>
            {'count' in item && (counts[item.count] ?? 0) > 0 && (
              <span className="mono" style={{
                fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
              }}>{counts[item.count]}</span>
            )}
          </NavLink>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 8 }} />

      {/* The footer is the collection's own vital signs. */}
      <div className="mono" style={{
        padding: '12px 16px 14px', borderTop: '1px solid var(--nyx-line)',
        fontSize: px(10), color: 'var(--nyx-txt-3)', lineHeight: 1.65,
      }}>
        <div>{stats.albums} albums · {stats.tracks} tracks</div>
        <div>{Math.round(stats.duration / 3600)} h · navidrome</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--nyx-positive)', flex: 'none',
          }} />
          <span>connected{queueLength > 0 ? ` · ${queueLength} queued` : ''}</span>
        </div>
      </div>
    </nav>
  )
}
