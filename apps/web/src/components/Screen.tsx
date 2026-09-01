import { px } from '../format.js'
/** Shared screen furniture: the title row with its right-aligned mono count,
 *  and the states a screen can be in. Keeping these in one place is what
 *  stops twenty-four screens from drifting apart. */

export function ScreenHeader(
  // `string | undefined` rather than optional keys: with
  // exactOptionalPropertyTypes, a caller computing `x ? a : undefined` is a
  // different type from omitting the prop, and callers do that constantly.
  { title, meta, sub }:
  { title: string; meta?: string | undefined; sub?: string | undefined },
) {
  return (
    <header style={{
      borderBottom: '1px solid var(--nyx-line)',
      paddingBottom: 'var(--nyx-s-4)', marginBottom: 'var(--nyx-s-6)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 'var(--nyx-s-5)', flexWrap: 'wrap',
      }}>
        <h1 className="display" style={{
          margin: 0, fontSize: 'var(--nyx-t-disp-lg)', fontWeight: 300,
        }}>{title}</h1>
        {meta && (
          <span className="mono" style={{
            fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
          }}>{meta}</span>
        )}
      </div>
      {sub && (
        <div className="mono" style={{
          fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)',
          marginTop: 6, letterSpacing: 'var(--nyx-ls-eyebrow)', textTransform: 'uppercase',
        }}>{sub}</div>
      )}
    </header>
  )
}

export function Screen({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 'var(--nyx-pad-screen-desktop)' }}>{children}</div>
}

/** Absent states are designed, never a spinner that never resolves. */
export function Placeholder(
  { title, lines, tone }:
  { title: string; lines?: string[] | undefined; tone?: 'negative' | 'warning' | undefined },
) {
  const colour = tone === 'negative' ? 'var(--nyx-negative)'
    : tone === 'warning' ? 'var(--nyx-warning)' : 'var(--nyx-txt-2)'
  return (
    <div style={{ padding: 'var(--nyx-pad-screen-desktop)', maxWidth: 520 }}>
      <p className="display" style={{
        fontSize: px(30), fontWeight: 300, margin: 0, color: colour,
      }}>{title}</p>
      {lines && (
        <div className="mono" style={{
          marginTop: 'var(--nyx-s-4)', fontSize: 'var(--nyx-t-mono-sm)',
          color: 'var(--nyx-txt-3)', lineHeight: 1.9,
        }}>
          {lines.map((l, i) => <div key={i}>{l || ' '}</div>)}
        </div>
      )}
    </div>
  )
}
