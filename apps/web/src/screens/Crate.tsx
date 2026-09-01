import { useMemo, useState } from 'react'
import { useAlbums } from '../hooks/library.js'
import { useClient } from '../api/context.js'
import { usePlayer } from '../player.js'
import { usePalette } from '../palette/usePalette.js'
import { bury, loadBuried, selectCandidates } from '../crate/select.js'
import { duration, signalPath, px } from '../format.js'
import { Placeholder } from '../components/Screen.js'

/**
 * Deliberately button-driven rather than swipe-driven: a gesture-first crate
 * fights the "deliberate, not infinite" principle, and this should feel like
 * pulling one record out of a shelf, not flicking through a feed.
 */
export function Crate() {
  const { data: albums, isLoading } = useAlbums()
  const client = useClient()
  const playAlbum = usePlayer((s) => s.playAlbum)

  const [buried, setBuried] = useState(loadBuried)
  const [seen, setSeen] = useState<string[]>([])
  const [dug, setDug] = useState(0)
  const [played, setPlayed] = useState(0)
  const [buriedCount, setBuriedCount] = useState(0)

  const candidates = useMemo(
    () => selectCandidates(albums ?? [], buried, Date.now()),
    [albums, buried],
  )
  const current = candidates.find((c) => !seen.includes(c.album.id))
  const cover = client.coverArtUrl(current?.album.coverArt, 600)
  usePalette(cover)

  if (isLoading) return <Placeholder title="Opening the crate…" />

  if (!current) {
    return (
      <Summary
        dug={dug} played={played} buried={buriedCount}
        exhausted={candidates.length === 0}
        onRestart={() => { setSeen([]); setDug(0); setPlayed(0); setBuriedCount(0) }}
      />
    )
  }

  const { album, reason } = current
  const advance = () => { setSeen((s) => [...s, album.id]); setDug((n) => n + 1) }

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', padding: 'var(--nyx-pad-screen-desktop)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--nyx-s-5)',
    }}>
      <div className="mono" style={{
        fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
        letterSpacing: 'var(--nyx-ls-mono)', alignSelf: 'flex-start',
      }}>Crate · {dug} dug · {played} played</div>

      {/* The stack: two offset layers behind, so it reads as records in a crate. */}
      <div style={{ position: 'relative', width: 'min(420px, 100%)', aspectRatio: '1' }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0, background: 'var(--nyx-bg-2)',
          borderRadius: 'var(--nyx-r-sleeve)',
          transform: 'translate(20px, 20px) scale(0.97)',
        }} />
        <div aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: 'var(--nyx-r-sleeve)',
          background: 'var(--nyx-bg-3)', filter: 'brightness(0.5)',
          transform: 'translate(10px, 10px) scale(0.985)',
        }} />
        {cover ? (
          <img key={album.id} src={cover} alt="" style={{
            position: 'relative', width: '100%', height: '100%', objectFit: 'cover',
            borderRadius: 'var(--nyx-r-sleeve)', boxShadow: 'var(--nyx-e-3)',
            animation: 'nyx-rise var(--nyx-dur-slow) var(--nyx-ease)',
          }} />
        ) : (
          <div style={{
            position: 'relative', width: '100%', height: '100%',
            display: 'grid', placeContent: 'center',
            background: 'repeating-linear-gradient(45deg, var(--nyx-bg-2) 0 10px, var(--nyx-bg-1) 10px 20px)',
            borderRadius: 'var(--nyx-r-sleeve)', boxShadow: 'var(--nyx-e-3)',
          }}>
            <span className="eyebrow">No artwork</span>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <h2 className="display" style={{
          margin: 0, fontSize: px(30), fontWeight: 300, lineHeight: 1.15,
        }}>{album.name}</h2>
        <div style={{ fontSize: px(14), color: 'var(--nyx-txt-2)', marginTop: 6 }}>{album.artist}</div>

        {/* The reason is the feature. Everything else is packaging. */}
        <p className="mono" style={{
          margin: '18px auto 0', maxWidth: '44ch',
          fontSize: 'var(--nyx-t-mono-md)', color: 'var(--nyx-txt-2)', lineHeight: 1.8,
        }}>{reason}</p>

        <div className="mono" style={{
          marginTop: 12, fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)',
        }}>
          {[album.year, `${album.songCount} tracks`, duration(album.duration), album.genre]
            .filter(Boolean).join(' · ')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={async () => {
            const full = await client.getAlbum(album.id)
            playAlbum(full.song, 0)
            setPlayed((n) => n + 1)
            advance()
          }}
          style={{
            minHeight: 'var(--nyx-hit-min)', padding: '0 22px', fontWeight: 700,
            background: 'var(--nyx-txt-1)', color: 'var(--nyx-bg-0)',
            borderRadius: 'var(--nyx-r-2)',
          }}
        >Pull it out</button>

        <button onClick={advance} style={ghost}>Keep digging</button>

        <button
          onClick={() => { setBuried(bury(album.id)); setBuriedCount((n) => n + 1); advance() }}
          style={ghost}
        >Bury for a year</button>
      </div>
    </div>
  )
}

function Summary(
  { dug, played, buried, exhausted, onRestart }:
  { dug: number; played: number; buried: number; exhausted: boolean; onRestart: () => void },
) {
  return (
    <div style={{
      maxWidth: 520, margin: '0 auto', padding: 'var(--nyx-pad-screen-desktop)',
    }}>
      <h2 className="display" style={{ margin: 0, fontSize: px(30), fontWeight: 300 }}>
        {exhausted ? 'You have dug through the whole crate.' : 'Pulled out.'}
      </h2>
      <p className="mono" style={{
        marginTop: 'var(--nyx-s-4)', fontSize: 'var(--nyx-t-mono-sm)',
        color: 'var(--nyx-txt-3)', lineHeight: 1.9,
      }}>
        {exhausted
          ? 'Nothing here has gone unplayed for three months.\nThat is a good problem to have.'
          : 'The rest of the crate is still there.\nCome back when you want another.'}
      </p>

      <div style={{
        display: 'flex', gap: 'var(--nyx-s-7)', marginTop: 'var(--nyx-s-6)',
        paddingBottom: 'var(--nyx-s-5)', borderBottom: '1px solid var(--nyx-line)',
      }}>
        {[['dug', dug], ['played', played], ['buried', buried]].map(([label, n]) => (
          <div key={label as string}>
            <div className="mono" style={{
              fontSize: px(30), color: 'var(--nyx-txt-1)', fontVariantNumeric: 'tabular-nums',
            }}>{n}</div>
            <div className="eyebrow" style={{ marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <button onClick={onRestart} style={{
        marginTop: 'var(--nyx-s-5)', minHeight: 'var(--nyx-hit-min)', padding: '0 22px',
        border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
        color: 'var(--nyx-txt-2)',
      }}>Start a new dig</button>
    </div>
  )
}

const ghost: React.CSSProperties = {
  minHeight: 'var(--nyx-hit-min)', padding: '0 18px',
  border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
  color: 'var(--nyx-txt-2)',
}
