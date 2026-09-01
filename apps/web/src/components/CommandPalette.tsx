import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlbums } from '../hooks/library.js'
import { usePlayer } from '../player.js'
import { px } from '../format.js'

interface Item {
  kind: 'GO' | 'DO' | 'PLAY'
  label: string
  /** `string | undefined` rather than `hint?:` — exactOptionalPropertyTypes
   *  distinguishes an absent key from one explicitly set to undefined, and an
   *  album without a year genuinely produces the latter. */
  hint: string | undefined
  run: () => void
}

const VISIBLE = 9

export function CommandPalette(
  { open, onClose, onAmbient, onNowPlaying, onQueue, onKeys }:
  {
    open: boolean; onClose: () => void; onAmbient: () => void
    onNowPlaying: () => void; onQueue: () => void; onKeys: () => void
  },
) {
  const navigate = useNavigate()
  const { data: albums } = useAlbums()
  const engine = usePlayer((s) => s.engine)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)

  const items = useMemo<Item[]>(() => {
    const go = (label: string, to: string): Item => ({
      kind: 'GO', label, hint: to, run: () => navigate(to),
    })
    const act = (label: string, hint: string, run: () => void): Item =>
      ({ kind: 'DO', label, hint, run })
    return [
      go('Albums', '/albums'), go('Artists', '/artists'), go('Genres', '/genres'),
      go('Search', '/search'), go('Crate', '/crate'), go('Settings', '/settings'),
      act('Play / pause', 'space', () => void engine?.toggle()),
      act('Now playing', 'n', onNowPlaying),
      act('Queue', 'q', onQueue),
      act('Ambient display', 'd', onAmbient),
      act('Keyboard shortcuts', '?', onKeys),
      ...(albums ?? []).map((a): Item => ({
        kind: 'PLAY',
        label: `${a.name} · ${a.artist}`,
        hint: a.year ? String(a.year) : undefined,
        run: () => navigate(`/album/${a.id}`),
      })),
    ]
  }, [albums, navigate, engine, onAmbient, onNowPlaying, onQueue, onKeys])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items.slice(0, VISIBLE)
    return items.filter((i) => i.label.toLowerCase().includes(needle)).slice(0, VISIBLE)
  }, [items, q])

  useEffect(() => { setCursor(0) }, [q])
  useEffect(() => { if (open) setQ('') }, [open])

  if (!open) return null

  const commit = (item: Item | undefined) => { if (item) { item.run(); onClose() } }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'oklch(0.14 0.01 268 / 0.72)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="Command palette"
        style={{
          width: 'min(620px, 92vw)', maxHeight: '66vh', overflow: 'hidden',
          background: 'var(--nyx-bg-1)', border: '1px solid var(--nyx-line)',
          borderRadius: 'var(--nyx-r-3)', boxShadow: 'var(--nyx-e-3)',
          animation: 'nyx-rise var(--nyx-dur-mid) var(--nyx-ease)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
          borderBottom: '1px solid var(--nyx-line)',
        }}>
          <span className="mono" style={{
            fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
          }}>⌘K</span>
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Go to, play, or run…"
            aria-label="Command"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
              if (e.key === 'Enter') { e.preventDefault(); commit(filtered[cursor]) }
              if (e.key === 'Escape') onClose()
            }}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: px(16), color: 'var(--nyx-txt-1)',
              fontFamily: 'var(--nyx-font-body)',
            }}
          />
        </div>

        <div style={{ padding: 8, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div className="mono" style={{
              padding: '14px 12px', fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
            }}>Nothing matches that.</div>
          ) : filtered.map((item, i) => (
            <button
              key={`${item.kind}-${item.label}`}
              onClick={() => commit(item)}
              onMouseEnter={() => setCursor(i)}
              style={{
                display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 12,
                width: '100%', textAlign: 'left', alignItems: 'center',
                padding: '10px 12px', borderRadius: 'var(--nyx-r-2)',
                background: i === cursor ? 'var(--nyx-bg-2)' : 'transparent',
              }}
            >
              <span className="mono" style={{
                fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)',
              }}>{item.kind}</span>
              <span style={{
                fontSize: px(13.5), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.label}</span>
              {item.hint && (
                <span className="mono" style={{
                  fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)',
                }}>{item.hint}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
