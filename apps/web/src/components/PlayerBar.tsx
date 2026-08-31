import { usePlayer } from '../player.js'
import { duration, outputPath } from '../format.js'

/** Grid, not flex (the handoff is explicit): flex negotiation crushes a
 *  column at narrow widths, the grid floors prevent it. */
export function PlayerBar() {
  const { queue, index, status, position, duration: dur, path, gain, outputSampleRate, engine } = usePlayer()
  const track = queue[index]
  if (!track) return null

  const pct = dur > 0 ? (position / dur) * 100 : 0

  return (
    <div style={{
      height: 78, flex: 'none',
      background: 'var(--nyx-bg-1)', borderTop: '1px solid var(--nyx-line)',
      display: 'grid',
      gridTemplateColumns: 'minmax(190px,1fr) minmax(210px,620px) minmax(150px,1fr)',
      gap: 'var(--nyx-s-5)', padding: '0 18px', alignItems: 'center',
      overflow: 'hidden',
    }}>
      {/* left — what is playing */}
      <div style={{ minWidth: 0 }}>
        <div className="display" style={{
          fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{track.title}</div>
        <div style={{
          fontSize: 11.5, color: 'var(--nyx-txt-2)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{track.artist}</div>
      </div>

      {/* centre — transport and scrubber */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <button aria-label="Previous track" onClick={() => void engine?.previous()}
            style={glyph}>‹‹</button>
          <button
            aria-label={status === 'playing' ? 'Pause' : 'Play'}
            onClick={() => void engine?.toggle()}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'var(--nyx-txt-1)', color: 'var(--nyx-bg-0)',
              display: 'grid', placeItems: 'center', fontSize: 15,
            }}
          >{status === 'playing' ? '❙❙' : '▶'}</button>
          <button aria-label="Next track" onClick={() => void engine?.next()}
            style={glyph}>››</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="mono" style={time}>{duration(position)}</span>
          <div
            role="slider" aria-label="Seek" tabIndex={0}
            aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(position)}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              void engine?.seek(((e.clientX - r.left) / r.width) * dur)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') void engine?.seek(position + 5)
              if (e.key === 'ArrowLeft') void engine?.seek(position - 5)
            }}
            style={{
              flex: 1, height: 3, borderRadius: 999, cursor: 'pointer',
              background: 'var(--nyx-bg-3)',
            }}
          >
            <div style={{
              width: `${pct}%`, height: '100%', borderRadius: 999,
              background: 'var(--nyx-art-bar)',
            }} />
          </div>
          <span className="mono" style={time}>{duration(dur)}</span>
        </div>
      </div>

      {/* right — the signal path. Real numbers, and honest about resampling. */}
      <div className="mono" style={{
        textAlign: 'right', fontSize: 10, color: 'var(--nyx-txt-2)', minWidth: 0,
      }}>
        <div>{path === 'buffer' ? 'gapless' : 'streaming'}{gain?.untagged ? ' · no replaygain' : ''}</div>
        <div style={{ color: 'var(--nyx-txt-3)' }}>
          {outputPath(44100, outputSampleRate)}
        </div>
      </div>
    </div>
  )
}

const glyph: React.CSSProperties = {
  fontSize: 16, color: 'var(--nyx-txt-2)',
  minWidth: 'var(--nyx-hit-min)', minHeight: 'var(--nyx-hit-min)',
}
const time: React.CSSProperties = {
  fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)', flex: 'none',
}
