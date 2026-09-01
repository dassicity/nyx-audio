import { useState } from 'react'
import { usePlayer } from '../player.js'
import { useLibraryStats } from '../hooks/library.js'
import { clearCredentials } from '../auth.js'
import { Screen, ScreenHeader } from '../components/Screen.js'
import { TEXT_SIZES, useTextSize } from '../hooks/textScale.js'
import type { TextSize } from '../hooks/textScale.js'
import type { ReplayGainMode } from '@nyx/player'
import { px } from '../format.js'

export function Settings({ onSignOut }: { onSignOut: () => void }) {
  const stats = useLibraryStats()
  const { engine, outputSampleRate, gain, path } = usePlayer()
  const [mode, setMode] = useState<ReplayGainMode>('album')
  const [strength, setStrength] = useState(70)
  const [textSize, setTextSize] = useTextSize()

  return (
    <Screen>
      <ScreenHeader title="Settings" />
      <div style={{ maxWidth: 760, display: 'grid', gap: 'var(--nyx-s-7)' }}>

        <Section title="Playback">
          <Row label="Gapless" hint="preloads the next track and schedules it on the audio clock">
            <Pill>{path === 'buffer' ? 'active' : path === 'stream' ? 'streaming — too long to buffer' : '—'}</Pill>
          </Row>
          <Row label="ReplayGain" hint="album gain preserves the record as it was sequenced">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['album', 'track', 'off'] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); engine?.setGainSettings({ mode: m }) }}
                  className="mono" style={{
                    ...pill,
                    color: mode === m ? 'var(--nyx-txt-1)' : 'var(--nyx-txt-3)',
                    background: mode === m ? 'var(--nyx-bg-2)' : 'transparent',
                  }}>{m}</button>
              ))}
            </div>
          </Row>
          <Row label="Applied gain" hint={gain?.untagged ? 'this track carries no ReplayGain tag' : 'from the tags beets wrote at import'}>
            <Pill>{gain ? `${gain.appliedDb.toFixed(2)} dB${gain.clippingPrevented ? ' · clipping held back' : ''}` : '—'}</Pill>
          </Row>
          <Row label="Crossfade" hint="off is correct for albums">
            <Pill dashed>off</Pill>
          </Row>
        </Section>

        <Section title="Appearance">
          <Row label="Artwork drives the palette"
               hint="clamped to WCAG AA regardless of position">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range" min={0} max={100} value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                aria-label="Palette strength"
                style={{ width: 160 }}
              />
              <span className="mono" style={{
                fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)', width: 38,
              }}>{strength}%</span>
            </div>
          </Row>
          <Row label="Text size" hint={TEXT_SIZES[textSize].hint}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(Object.keys(TEXT_SIZES) as TextSize[]).map((k) => (
                <button key={k} onClick={() => setTextSize(k)} className="mono" style={{
                  ...pill,
                  color: textSize === k ? 'var(--nyx-txt-1)' : 'var(--nyx-txt-3)',
                  background: textSize === k ? 'var(--nyx-bg-2)' : 'transparent',
                }}>{TEXT_SIZES[k].label}</button>
              ))}
            </div>
          </Row>
          <Row label="Theme" hint="night is the primary design"><Pill>night</Pill></Row>
        </Section>

        <Section title="Signal path">
          <Row label="Output" hint="what the browser is actually running at">
            <Pill>{outputSampleRate ? `${(outputSampleRate / 1000).toFixed(1)} kHz` : 'idle'}</Pill>
          </Row>
          <Row label="Away from home" hint="transcoding to Opus needs nyx-api">
            <Pill dashed>planned</Pill>
          </Row>
        </Section>

        <Section title="Lyrics and enrichment">
          <Row label="Lyrics" hint="lrclib · fetched per track, not cached between sessions">
            <Pill>lrclib.net</Pill>
          </Row>
          <Row label="Genres" hint="file tags today; MusicBrainz needs nyx-api">
            <Pill dashed>file tags</Pill>
          </Row>
          <Row label="When offline" hint="absent states, never spinners"><Pill>degrade quietly</Pill></Row>
        </Section>

        <Section title="Statistics and privacy">
          <Row label="Play history" hint="the event log lives in nyx-api, which is not built yet">
            <Pill dashed>planned</Pill>
          </Row>
          <Row label="ListenBrainz" hint="optional, off by default"><Pill dashed>off</Pill></Row>
        </Section>

        <Section title="About">
          <Row label="Library" hint="scanned by navidrome">
            <Pill>{stats.albums} albums · {stats.tracks} tracks</Pill>
          </Row>
          <Row label="Session" hint="credentials are stored in this browser only">
            <button onClick={() => { clearCredentials(); onSignOut() }} className="mono" style={pill}>
              sign out
            </button>
          </Row>
        </Section>
      </div>
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="eyebrow" style={{
        paddingBottom: 8, borderBottom: '1px solid var(--nyx-line)',
      }}>{title}</div>
      {children}
    </section>
  )
}

function Row(
  { label, hint, children }: { label: string; hint: string; children: React.ReactNode },
) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 'var(--nyx-s-5)', padding: '14px 0',
      borderBottom: '1px solid var(--nyx-line-soft)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: px(13.5) }}>{label}</div>
        <div className="mono" style={{
          fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', marginTop: 3,
        }}>{hint}</div>
      </div>
      <div style={{ flex: 'none' }}>{children}</div>
    </div>
  )
}

function Pill({ children, dashed }: { children: React.ReactNode; dashed?: boolean }) {
  return (
    <span className="mono" style={{
      ...pill,
      borderStyle: dashed ? 'dashed' : 'solid',
      color: dashed ? 'var(--nyx-txt-3)' : 'var(--nyx-txt-2)',
      display: 'inline-block',
    }}>{children}</span>
  )
}

const pill: React.CSSProperties = {
  fontSize: px(10.5), letterSpacing: 'var(--nyx-ls-mono)',
  border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-pill)',
  padding: '6px 12px', minHeight: 32,
}
