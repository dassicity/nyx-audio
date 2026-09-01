import { useEffect, useState } from 'react'
import { usePlayer } from '../player.js'
import { useClient } from '../api/context.js'
import { useLyrics } from '../hooks/lyrics.js'
import { usePalette } from '../palette/usePalette.js'
import { duration, outputPath, signalPath, px } from '../format.js'
import { Lyrics } from './Lyrics.js'

export function NowPlaying({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { queue, index, status, position, duration: dur, outputSampleRate, engine } = usePlayer()
  const client = useClient()
  const [showLyrics, setShowLyrics] = useState(false)
  const track = queue[index]
  const next = queue[index + 1]

  const cover = client.coverArtUrl(track?.id ? coverIdOf(track.id) : undefined, 800)
  usePalette(cover)

  const lyrics = useLyrics(open && showLyrics ? track : undefined)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (e.key === 'Escape') onClose()
      if (e.key.toLowerCase() === 'l') setShowLyrics((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!track) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 40,
      background: 'var(--nyx-art-deep)',
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform var(--nyx-dur-mid) var(--nyx-ease), background var(--nyx-dur-slow) var(--nyx-ease)',
      display: 'flex', flexDirection: 'column',
      visibility: open ? 'visible' : 'hidden',
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(110% 80% at 50% 0%, var(--nyx-art-wash), transparent 70%)',
      }} />

      <header style={{
        position: 'relative', display: 'grid',
        gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
        padding: '16px 22px', gap: 12,
      }}>
        <button onClick={onClose} className="mono" style={{
          justifySelf: 'start', fontSize: 'var(--nyx-t-mono-sm)',
          letterSpacing: 'var(--nyx-ls-eyebrow)', color: 'var(--nyx-txt-2)',
          minHeight: 'var(--nyx-hit-min)',
        }}>▾ CLOSE</button>

        <span className="mono" style={{
          fontSize: 'var(--nyx-t-mono-xs)', letterSpacing: 'var(--nyx-ls-eyebrow)',
          textTransform: 'uppercase', color: 'var(--nyx-txt-3)',
        }}>from {track.album}</span>

        <button onClick={() => setShowLyrics((v) => !v)} className="mono" style={{
          justifySelf: 'end', fontSize: 'var(--nyx-t-mono-xs)',
          letterSpacing: 'var(--nyx-ls-eyebrow)', textTransform: 'uppercase',
          border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-pill)',
          padding: '6px 14px', minHeight: 34,
          color: showLyrics ? 'var(--nyx-txt-1)' : 'var(--nyx-txt-3)',
          background: showLyrics ? 'var(--nyx-bg-2)' : 'transparent',
        }}>Lyrics</button>
      </header>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {showLyrics ? (
          <Lyrics
            data={lyrics.data}
            loading={lyrics.isLoading}
            position={position}
            onSeek={(t) => void engine?.seek(t)}
          />
        ) : (
          <div style={{
            display: 'flex', gap: 64, alignItems: 'center', justifyContent: 'center',
            padding: '20px 7vw 50px', flexWrap: 'wrap', minHeight: '100%',
          }}>
            <div style={{ position: 'relative', width: 'min(42vh, 460px)', flex: 'none' }}>
              <div aria-hidden style={{
                position: 'absolute', inset: '-12%', borderRadius: '50%',
                background: 'radial-gradient(circle, var(--nyx-art-glow), transparent 70%)',
                filter: 'blur(64px)', opacity: 0.62,
              }} />
              {cover && (
                <img src={cover} alt="" style={{
                  position: 'relative', width: '100%', aspectRatio: '1',
                  objectFit: 'cover', borderRadius: 'var(--nyx-r-sleeve)',
                  boxShadow: 'var(--nyx-e-3)',
                }} />
              )}
            </div>

            <div style={{ maxWidth: 520, minWidth: 260, flex: 1 }}>
              <div className="eyebrow">Now playing</div>
              <h1 className="display" style={{
                margin: '10px 0 0', fontWeight: 300, lineHeight: 1.06,
                fontSize: px(track.title.length > 44 ? 34 : 46),
              }}>{track.title}</h1>
              <div className="display" style={{
                fontSize: px(20), color: 'var(--nyx-txt-2)', marginTop: 8,
              }}>{track.artist}</div>
              <div className="mono" style={{
                fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)', marginTop: 6,
              }}>{track.album}</div>

              <Scrubber position={position} dur={dur} onSeek={(t) => void engine?.seek(t)} />

              <div style={{
                display: 'flex', alignItems: 'center', gap: 26, marginTop: 'var(--nyx-s-5)',
              }}>
                <button aria-label="Previous track" onClick={() => void engine?.previous()}
                  style={glyph}>‹‹</button>
                <button
                  aria-label={status === 'playing' ? 'Pause' : 'Play'}
                  onClick={() => void engine?.toggle()}
                  style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'var(--nyx-txt-1)', color: 'var(--nyx-bg-0)',
                    display: 'grid', placeItems: 'center', fontSize: px(19),
                  }}
                >{status === 'playing' ? '❙❙' : '▶'}</button>
                <button aria-label="Next track" onClick={() => void engine?.next()}
                  style={glyph}>››</button>
              </div>

              <div className="mono" style={{
                marginTop: 'var(--nyx-s-6)', paddingTop: 'var(--nyx-s-4)',
                borderTop: '1px solid var(--nyx-line)',
                fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)', lineHeight: 1.9,
              }}>
                <div>{outputPath(44100, outputSampleRate)}</div>
                {next && (
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                    <span>NEXT</span>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--nyx-txt-2)',
                    }}>{next.title}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Scrubber(
  { position, dur, onSeek }: { position: number; dur: number; onSeek: (t: number) => void },
) {
  const pct = dur > 0 ? (position / dur) * 100 : 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, marginTop: 'var(--nyx-s-6)',
    }}>
      <span className="mono" style={t}>{duration(position)}</span>
      <div
        role="slider" aria-label="Seek" tabIndex={0}
        aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(position)}
        aria-valuetext={duration(position)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onSeek(((e.clientX - r.left) / r.width) * dur)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); onSeek(position + 5) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); onSeek(position - 5) }
        }}
        style={{
          flex: 1, height: 4, borderRadius: 999,
          background: 'var(--nyx-bg-3)', cursor: 'pointer',
        }}
      >
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 999,
          background: 'var(--nyx-art-bar)',
        }} />
      </div>
      <span className="mono" style={t}>{duration(dur)}</span>
    </div>
  )
}

/** The engine's Track ids are song ids; Subsonic serves cover art by the same
 *  id for a song, so this is an identity today. Kept named so the day it stops
 *  being true there is one place to change. */
function coverIdOf(songId: string): string { return songId }

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

const glyph: React.CSSProperties = {
  fontSize: px(20), color: 'var(--nyx-txt-2)',
  minWidth: 'var(--nyx-hit-min)', minHeight: 'var(--nyx-hit-min)',
}
const t: React.CSSProperties = {
  fontSize: px(11), color: 'var(--nyx-txt-3)', flex: 'none',
}
