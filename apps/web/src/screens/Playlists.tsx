import { useQuery } from '@tanstack/react-query'
import { useClient } from '../api/context.js'
import { duration, px } from '../format.js'
import { Screen, ScreenHeader, Placeholder } from '../components/Screen.js'

export function Playlists() {
  const client = useClient()
  const { data, isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => client.getPlaylists(),
  })

  if (isLoading) return <Placeholder title="Reading the shelves…" />

  const lists = data ?? []

  return (
    <Screen>
      <ScreenHeader title="Playlists" meta={lists.length ? `${lists.length} playlists` : undefined} />

      {lists.length === 0 ? (
        <Placeholder title="No playlists yet."
          lines={['Save a queue as a playlist and it appears here.']} />
      ) : (
        <div style={{ maxWidth: 760 }}>
          {lists.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: '1px solid var(--nyx-line-soft)',
            }}>
              <img src={client.coverArtUrl(p.coverArt, 72)} alt="" style={{
                width: 36, height: 36, flex: 'none', objectFit: 'cover',
                borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="display" style={{ fontSize: px(17) }}>{p.name}</div>
              </div>
              <span className="mono" style={{
                fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)',
              }}>{p.songCount} tracks · {duration(p.duration)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{
        marginTop: 'var(--nyx-s-7)', maxWidth: '60ch',
        border: '1px dashed var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
        padding: 'var(--nyx-s-5)', opacity: 0.72,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span className="mono" style={{
            fontSize: px(9), letterSpacing: '0.16em', textTransform: 'uppercase',
            border: '1px dashed var(--nyx-line)', borderRadius: 'var(--nyx-r-pill)',
            padding: '3px 9px', color: 'var(--nyx-txt-3)',
          }}>Planned</span>
          <span className="mono" style={{
            fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
          }}>smart playlists · v1.2</span>
        </div>
        <p className="mono" style={{
          margin: 0, fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)', lineHeight: 1.8,
        }}>Rule-based and saved — 24-bit only, unplayed this year, everything from 1974.</p>
      </div>
    </Screen>
  )
}
