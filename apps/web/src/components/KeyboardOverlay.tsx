import { px } from '../format.js'
const KEYS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← →', 'Seek ∓5 seconds'],
  ['N', 'Now playing'],
  ['L', 'Lyrics'],
  ['F', 'Turn the sleeve over'],
  ['Q', 'Queue'],
  ['D', 'Ambient display'],
  ['/', 'Search'],
  ['⌘K', 'Command palette'],
  ['?', 'This list'],
  ['Esc', 'Close anything'],
]

export function KeyboardOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'oklch(0.14 0.01 268 / 0.72)',
        display: 'grid', placeItems: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="Keyboard shortcuts"
        style={{
          width: 'min(760px, 94vw)', padding: 28,
          background: 'var(--nyx-bg-1)', border: '1px solid var(--nyx-line)',
          borderRadius: 'var(--nyx-r-3)', boxShadow: 'var(--nyx-e-3)',
          animation: 'nyx-rise var(--nyx-dur-mid) var(--nyx-ease)',
        }}
      >
        <h2 className="display" style={{
          margin: '0 0 20px', fontSize: px(26), fontWeight: 300,
        }}>Keyboard</h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '10px 26px',
        }}>
          {KEYS.map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="mono" style={{
                minWidth: 52, textAlign: 'center', padding: '5px 8px',
                border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-1)',
                fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-2)', flex: 'none',
              }}>{key}</span>
              <span style={{ fontSize: px(12.5), color: 'var(--nyx-txt-2)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
