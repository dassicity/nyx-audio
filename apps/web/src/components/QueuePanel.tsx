import { usePlayer } from '../player.js'
import { useClient } from '../api/context.js'
import { duration, px } from '../format.js'
import type { Track } from '@nyx/player'

/**
 * A floating panel, not a screen — reachable from anywhere without losing
 * where you were.
 */
export function QueuePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { queue, index, engine } = usePlayer()
  const client = useClient()

  const history = queue.slice(Math.max(0, index - 2), index)
  const current = queue[index]
  const upNext = queue.slice(index + 1)

  return (
    <aside
      aria-label="Queue"
      aria-hidden={!open}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 344, maxWidth: '100%',
        zIndex: 35, background: 'var(--nyx-bg-1)',
        borderLeft: '1px solid var(--nyx-line)',
        boxShadow: '-24px 0 60px oklch(0.12 0.012 48 / 0.45)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform var(--nyx-dur-mid) var(--nyx-ease)',
        display: 'flex', flexDirection: 'column',
        visibility: open ? 'visible' : 'hidden',
      }}
    >
      <header style={{
        padding: '16px 16px 12px', borderBottom: '1px solid var(--nyx-line)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div className="display" style={{ fontSize: px(17) }}>Queue</div>
          {current && (
            <div className="mono" style={{
              fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', marginTop: 4,
            }}>playing from {current.album}</div>
          )}
        </div>
        <button onClick={onClose} aria-label="Close queue" style={{
          color: 'var(--nyx-txt-3)', minWidth: 32, minHeight: 32, fontSize: px(15),
        }}>×</button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {queue.length === 0 ? (
          <div style={{
            border: '1px dashed var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
            padding: 'var(--nyx-s-5)',
          }}>
            <p className="mono" style={{
              margin: 0, fontSize: 'var(--nyx-t-mono-sm)',
              color: 'var(--nyx-txt-3)', lineHeight: 1.8,
            }}>Nothing queued. Play a record and it fills from the album, in order.</p>
          </div>
        ) : (
          <>
            {history.map((t, i) => (
              <Row key={`h-${t.id}-${i}`} track={t} client={client} dim />
            ))}

            {current && (
              <div style={{
                background: 'var(--nyx-art-deep)',
                borderLeft: '2px solid var(--nyx-art-bar)',
                borderRadius: 'var(--nyx-r-1)', padding: 8, margin: '6px 0',
                transition: 'background var(--nyx-dur-slow) var(--nyx-ease)',
              }}>
                <Row track={current} client={client} sub={
                  `${current.artist} · ${current.replayGainAlbumDb !== undefined ? 'replaygain' : 'no gain'}`
                } />
              </div>
            )}

            {upNext.map((t, i) => {
              const at = index + 1 + i
              return (
                <div key={`u-${t.id}-${at}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{
                    width: 20, textAlign: 'right', flex: 'none',
                    fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)',
                  }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Row track={t} client={client} sub={t.artist} />
                  </div>
                  <div style={{ display: 'flex', gap: 2, flex: 'none' }}>
                    <Ctl label="Move up" onClick={() => engine?.reorder(at, at - 1)}>↑</Ctl>
                    <Ctl label="Move down" onClick={() => engine?.reorder(at, at + 1)}>↓</Ctl>
                    <Ctl label="Remove" onClick={() => engine?.remove(at)}>×</Ctl>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {queue.length > 0 && (
        <footer style={{
          padding: 12, borderTop: '1px solid var(--nyx-line)',
          display: 'flex', gap: 8,
        }}>
          <button style={{
            flex: 1, minHeight: 36, border: '1px solid var(--nyx-line)',
            borderRadius: 'var(--nyx-r-2)', fontSize: px(12.5), color: 'var(--nyx-txt-2)',
          }}>Save as playlist</button>
          <button onClick={() => engine?.clear()} style={{
            minHeight: 36, padding: '0 14px', border: '1px solid var(--nyx-line)',
            borderRadius: 'var(--nyx-r-2)', fontSize: px(12.5), color: 'var(--nyx-txt-3)',
          }}>Clear</button>
        </footer>
      )}
    </aside>
  )
}

function Row(
  { track, client, sub, dim }:
  { track: Track; client: ReturnType<typeof useClient>; sub?: string; dim?: boolean },
) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
      opacity: dim ? 0.5 : 1, minWidth: 0,
    }}>
      <img
        src={client.coverArtUrl(track.id, 72)} alt="" width={36} height={36}
        style={{
          width: 36, height: 36, flex: 'none', objectFit: 'cover',
          borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="display" style={{
          fontSize: px(14), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{track.title}</div>
        {sub && (
          <div className="mono" style={{
            fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{sub}</div>
        )}
      </div>
      <span className="mono" style={{
        fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', flex: 'none',
      }}>{duration(track.duration)}</span>
    </div>
  )
}

function Ctl(
  { children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void },
) {
  return (
    <button aria-label={label} onClick={onClick} style={{
      width: 28, height: 28, fontSize: px(12), color: 'var(--nyx-txt-3)',
      borderRadius: 'var(--nyx-r-1)',
    }}>{children}</button>
  )
}
