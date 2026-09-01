import { useEffect, useRef } from 'react'
import { usePlayer } from '../player.js'
import { useClient } from '../api/context.js'
import { outputPath, px } from '../format.js'

const BARS = 24

/**
 * Kiosk surface for a second screen or a panel by the amplifier. Ten-foot
 * legibility: this should be what a visitor notices from across the room.
 *
 * The meters read a real AnalyserNode. The handoff flagged its own
 * pseudo-random version as not final — a fake visualiser fails the
 * "designed element, not a stock visualiser" test.
 */
export function AmbientDisplay(
  { open, onClose, oledSafe, onToggleSafe }:
  { open: boolean; onClose: () => void; oledSafe: boolean; onToggleSafe: () => void },
) {
  const { queue, index, position, outputSampleRate, engine } = usePlayer()
  const client = useClient()
  const barsRef = useRef<HTMLDivElement>(null)
  const track = queue[index]
  const next = queue[index + 1]
  const cover = client.coverArtUrl(track?.id, 900)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Drive the meters from real output. Writes styles directly rather than
  // through React state: this runs at 60fps and must not re-render the tree.
  useEffect(() => {
    if (!open) return
    const analyser = engine?.analyser()
    const container = barsRef.current
    if (!analyser || !container) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    const bars = [...container.children] as HTMLElement[]
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0

    const tick = () => {
      analyser.getByteFrequencyData(data)
      for (let i = 0; i < bars.length; i++) {
        // Logarithmic bucketing: linear bins put almost everything in the
        // first two bars and leave the rest dead.
        const lo = Math.floor((data.length ** (i / bars.length)) - 1)
        const hi = Math.max(lo + 1, Math.floor((data.length ** ((i + 1) / bars.length)) - 1))
        let sum = 0
        for (let j = lo; j < hi && j < data.length; j++) sum += data[j]!
        const v = sum / Math.max(1, hi - lo) / 255
        bars[i]!.style.height = `${Math.max(2, v * 52)}px`
      }
      raf = requestAnimationFrame(tick)
    }

    if (!reduce) raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, engine, index])

  if (!open || !track) return null

  const clock = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 70, background: 'var(--nyx-art-deep)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '6vw', padding: '4vh 5vw', flexWrap: 'wrap',
      animation: oledSafe ? 'nyx-drift-stage 62s ease-in-out infinite' : undefined,
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: '-10%', pointerEvents: 'none',
        background: 'radial-gradient(circle at 40% 40%, var(--nyx-art-wash), transparent 65%)',
        filter: 'blur(80px)',
        opacity: oledSafe ? 0.45 : 0.8,
        animation: `nyx-drift ${oledSafe ? '48s' : '90s'} ease-in-out infinite`,
      }} />

      {cover && (
        <img src={cover} alt="" style={{
          position: 'relative', width: 'min(56vh, 620px)', aspectRatio: '1',
          objectFit: 'cover', borderRadius: 'var(--nyx-r-sleeve)',
          boxShadow: '0 40px 100px oklch(0.10 0.012 48 / 0.6)',
        }} />
      )}

      <div style={{ position: 'relative', maxWidth: 640, minWidth: 280, flex: 1 }}>
        <div className="mono" style={{
          fontSize: px(13), letterSpacing: '0.22em', color: 'var(--nyx-txt-3)',
        }}>{clock}</div>

        <h1 className="display" style={{
          margin: '18px 0 0', fontWeight: 300, lineHeight: 1.04,
          fontSize: 'clamp(44px, 5.4vw, 84px)',
        }}>{track.title}</h1>

        <div className="display" style={{
          fontSize: px(34), color: 'var(--nyx-txt-2)', marginTop: 14,
        }}>{track.artist}</div>

        <div ref={barsRef} aria-hidden style={{
          display: 'flex', alignItems: 'flex-end', gap: 4, height: 52,
          marginTop: 34, opacity: oledSafe ? 0.5 : 1,
        }}>
          {Array.from({ length: BARS }, (_, i) => (
            <div key={i} style={{
              width: 6, height: 2, borderRadius: 1,
              background: 'var(--nyx-art-bar)',
              transition: 'height 90ms linear',
            }} />
          ))}
        </div>

        <div className="mono" style={{
          marginTop: 30, fontSize: px(15), color: 'var(--nyx-txt-3)', lineHeight: 1.9,
        }}>
          <div>{outputPath(44100, outputSampleRate)}</div>
          {next && <div>NEXT · {next.title}</div>}
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 18, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 12,
      }}>
        <button onClick={onToggleSafe} className="mono" style={kioskBtn}>
          {oledSafe ? 'OLED-safe on' : 'OLED-safe off'}
        </button>
        <button onClick={onClose} className="mono" style={kioskBtn}>Close · esc</button>
      </div>
    </div>
  )
}

const kioskBtn: React.CSSProperties = {
  fontSize: px(10), letterSpacing: '0.16em', textTransform: 'uppercase',
  color: 'var(--nyx-txt-3)', border: '1px solid var(--nyx-line)',
  borderRadius: 'var(--nyx-r-pill)', padding: '7px 14px', minHeight: 34,
  opacity: 0.6,
}
