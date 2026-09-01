import { Screen, ScreenHeader } from '../components/Screen.js'
import { px } from '../format.js'

/**
 * The single "coming soon" treatment, applied uniformly — never ad-hoc
 * greying-out. Content is rendered as designed rather than blanked, so the
 * shape of the feature is visible before it works.
 */
export function Planned(
  { title, version, blurb, children }:
  { title: string; version: string; blurb: string; children?: React.ReactNode },
) {
  return (
    <Screen>
      <ScreenHeader title={title} />
      <div style={{
        border: '1px dashed var(--nyx-line)', borderRadius: 'var(--nyx-r-3)',
        opacity: 0.72, padding: 'var(--nyx-s-6)', maxWidth: '70ch',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span className="mono" style={{
            fontSize: px(9), letterSpacing: '0.16em', textTransform: 'uppercase',
            border: '1px dashed var(--nyx-line)', borderRadius: 'var(--nyx-r-pill)',
            padding: '3px 9px', color: 'var(--nyx-txt-3)',
          }}>Planned</span>
          <span className="mono" style={{
            fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
          }}>{version}</span>
        </div>
        <p style={{
          margin: 0, color: 'var(--nyx-txt-2)', fontSize: 'var(--nyx-t-body-md)',
          lineHeight: 1.7, maxWidth: '58ch',
        }}>{blurb}</p>
        {children}
      </div>
    </Screen>
  )
}
