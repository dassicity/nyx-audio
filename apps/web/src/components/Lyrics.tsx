import { useEffect, useRef } from 'react'
import { activeLineAt } from '../api/lyrics.js'
import type { Lyrics as LyricsData } from '../api/lyrics.js'
import { px } from '../format.js'

/**
 * Typography carries this screen entirely. Lines fall away by weight and
 * opacity rather than disappearing, so the shape of the whole lyric stays
 * visible while one line is emphasised.
 */
export function Lyrics(
  { data, position, onSeek, loading }:
  { data: LyricsData | undefined; position: number; onSeek: (t: number) => void; loading: boolean },
) {
  if (loading) return <Centre><Muted>Looking for lyrics…</Muted></Centre>
  if (!data) return <Absent title="No lyrics for this track." lines={['lrclib could not be reached.', '', 'Playback is unaffected — the music is on your own hardware.']} />

  switch (data.kind) {
    case 'synced': return <Synced lines={data.lines} position={position} onSeek={onSeek} />
    case 'plain': return <Plain text={data.text} />
    case 'instrumental': return <Absent title="Instrumental." lines={['lrclib has this marked as having no words.']} />
    case 'absent': return <Absent title="No lyrics for this track."
      lines={['lrclib returned no match.', '', 'Instrumental, or nobody has transcribed it. Either is fine.']} />
  }
}

function Synced(
  { lines, position, onSeek }:
  { lines: { time: number; text: string }[]; position: number; onSeek: (t: number) => void },
) {
  const active = activeLineAt(lines, position)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-line="${active}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  return (
    <div ref={ref} style={{
      maxWidth: 760, margin: '0 auto', padding: '38vh 20px',
    }}>
      {lines.map((line, i) => {
        const d = Math.abs(i - active)
        const isActive = i === active
        // Lines fall away by weight and opacity; they never disappear.
        const opacity = isActive ? 1 : d === 1 ? 0.5 : d === 2 ? 0.28 : 0.14
        return (
          <button
            key={`${line.time}-${i}`}
            data-line={i}
            onClick={() => onSeek(line.time)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '9px 0', fontFamily: 'var(--nyx-font-display)',
              fontSize: px(isActive ? 34 : 29),
              fontWeight: isActive ? 500 : 300,
              lineHeight: 1.3,
              color: isActive ? 'var(--nyx-art-lyric)' : 'var(--nyx-txt-1)',
              opacity,
              transition:
                'opacity var(--nyx-dur-slow) var(--nyx-ease),' +
                'color var(--nyx-dur-slow) var(--nyx-ease),' +
                'font-size var(--nyx-dur-mid) var(--nyx-ease)',
            }}
          >{line.text || ' '}</button>
        )
      })}
    </div>
  )
}

function Plain({ text }: { text: string }) {
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '10vh 20px' }}>
      <div className="eyebrow" style={{ marginBottom: 'var(--nyx-s-5)' }}>
        Unsynced · plain text from lrclib
      </div>
      {text.split('\n').map((line, i) => (
        <p key={i} className="display" style={{
          margin: 0, fontSize: px(22), lineHeight: 1.75, color: 'var(--nyx-txt-2)',
        }}>{line || ' '}</p>
      ))}
    </div>
  )
}

/** Designed, not empty — never a spinner that resolves to nothing. */
function Absent({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Centre>
      <div style={{ maxWidth: 520 }}>
        <p className="display" style={{
          margin: 0, fontSize: px(30), fontWeight: 300, color: 'var(--nyx-txt-1)',
        }}>{title}</p>
        <div className="mono" style={{
          marginTop: 'var(--nyx-s-5)', fontSize: 'var(--nyx-t-mono-sm)',
          color: 'var(--nyx-txt-3)', lineHeight: 1.9,
        }}>
          {lines.map((l, i) => <div key={i}>{l || ' '}</div>)}
        </div>
      </div>
    </Centre>
  )
}

const Centre = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', padding: 20 }}>
    {children}
  </div>
)
const Muted = ({ children }: { children: React.ReactNode }) => (
  <span className="mono" style={{
    fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
  }}>{children}</span>
)
