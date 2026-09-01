import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiUnavailable, getStats } from '../api/nyx.js'
import type { ClockCell, StatsRange } from '../api/nyx.js'
import { Screen, ScreenHeader, Placeholder } from '../components/Screen.js'
import { px } from '../format.js'

const RANGES: { key: StatsRange; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** An instrument panel to check, not a document to read. */
export function Stats() {
  const [range, setRange] = useState<StatsRange>('all')
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', range],
    queryFn: () => getStats(range),
    retry: false,
  })

  if (isLoading) return <Placeholder title="Reading the log…" />

  if (error instanceof ApiUnavailable) {
    return (
      <Placeholder
        title="Statistics need nyx-api."
        tone="warning"
        lines={[
          'Navidrome keeps a play counter; this needs the events.',
          '',
          'Deploy nyx-api and it starts recording from that moment.',
          'Nothing already played can be recovered.',
        ]}
      />
    )
  }
  if (error) return <Placeholder title="Could not read statistics." tone="negative"
    lines={[(error as Error).message]} />
  if (!data) return null

  const { summary, clock, formats, top_artists } = data

  if (summary.plays === 0) {
    return (
      <Screen>
        <ScreenHeader title="Statistics" />
        <Placeholder
          title="Nothing recorded yet."
          lines={[
            'A play counts at half the track, or four minutes, whichever is sooner.',
            '',
            'Put a record on and come back.',
          ]}
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title="Statistics" />

      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--nyx-s-6)', flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)} className="mono" style={{
            fontSize: px(10.5), letterSpacing: 'var(--nyx-ls-mono)',
            textTransform: 'uppercase', minHeight: 32, padding: '6px 12px',
            border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-pill)',
            color: range === r.key ? 'var(--nyx-txt-1)' : 'var(--nyx-txt-3)',
            background: range === r.key ? 'var(--nyx-bg-2)' : 'transparent',
          }}>{r.label}</button>
        ))}
      </div>

      {/* Labels stay short so nothing wraps at any width; detail goes below. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 1, background: 'var(--nyx-line)', border: '1px solid var(--nyx-line)',
        borderRadius: 'var(--nyx-r-2)', overflow: 'hidden',
      }}>
        <Kpi label="Time" value={hours(summary.seconds)} sub="listened" />
        <Kpi label="Plays" value={String(summary.plays)} sub={`${summary.tracks} distinct`} />
        <Kpi label="Albums" value={String(summary.albums)} sub={`${summary.artists} artists`} />
        <Kpi label="Streak" value={String(summary.streak_days)}
             sub={summary.streak_days === 1 ? 'day' : 'days'} />
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 'var(--nyx-s-7)', marginTop: 'var(--nyx-s-7)',
      }}>
        <Panel label="Listening clock" sub="local time · hour by weekday">
          <Clock cells={clock} />
        </Panel>

        {/* The statistic only this app can produce. */}
        <Panel label="Format" sub="share of listening time, not play count">
          {formats.map((f) => (
            <div key={f.label} style={{ marginBottom: 12 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                marginBottom: 5,
              }}>
                <span className="mono" style={{
                  fontSize: px(10.5), color: 'var(--nyx-txt-2)',
                }}>{f.label}</span>
                <span className="mono" style={{
                  fontSize: px(10.5), color: 'var(--nyx-txt-3)',
                }}>{Math.round(f.fraction * 100)}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--nyx-bg-2)', borderRadius: 999 }}>
                <div style={{
                  width: `${f.fraction * 100}%`, height: '100%',
                  background: 'var(--nyx-signal)', borderRadius: 999,
                }} />
              </div>
            </div>
          ))}
        </Panel>

        <Panel label="Top artists" sub={`${summary.artists} in this range`}>
          {top_artists.map((a) => {
            const max = top_artists[0]?.plays || 1
            return (
              <div key={a.name} style={{
                display: 'grid', gridTemplateColumns: '1fr 38% auto', gap: 12,
                alignItems: 'center', padding: '6px 0',
              }}>
                <span style={{
                  fontSize: px(13), overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.name}</span>
                <div style={{ height: 5, background: 'var(--nyx-bg-2)', borderRadius: 999 }}>
                  <div style={{
                    width: `${(a.plays / max) * 100}%`, height: '100%',
                    background: 'var(--nyx-art-bar)', borderRadius: 999,
                  }} />
                </div>
                <span className="mono" style={{
                  fontSize: px(10.5), color: 'var(--nyx-txt-3)',
                }}>{a.plays}</span>
              </div>
            )
          })}
        </Panel>
      </div>
    </Screen>
  )
}

function Clock({ cells }: { cells: ClockCell[] }) {
  const byKey = new Map(cells.map((c) => [`${c.weekday}-${c.hour}`, c.plays]))
  const peak = Math.max(1, ...cells.map((c) => c.plays))

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8 }}>
        <div style={{ display: 'grid', gap: 2 }}>
          {DAYS.map((d) => (
            <div key={d} className="mono" style={{
              height: 14, fontSize: px(9), color: 'var(--nyx-txt-3)',
              display: 'flex', alignItems: 'center',
            }}>{d}</div>
          ))}
        </div>
        <div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(24, minmax(10px, 1fr))', gap: 2,
          }}>
            {DAYS.map((_, wd) =>
              Array.from({ length: 24 }, (_, hr) => {
                const n = byKey.get(`${wd}-${hr}`) ?? 0
                const v = n / peak
                return (
                  <div
                    key={`${wd}-${hr}`}
                    title={`${DAYS[wd]} ${String(hr).padStart(2, '0')}:00 · ${n} ${n === 1 ? 'play' : 'plays'}`}
                    style={{
                      height: 14, borderRadius: 1,
                      // Below a threshold the cell is plain surface, so an
                      // empty hour reads as empty rather than faintly lit.
                      background: v < 0.12
                        ? 'var(--nyx-bg-2)'
                        : `oklch(${0.30 + v * 0.48} ${0.02 + v * 0.075} ${66 - v * 16})`,
                    }}
                  />
                )
              }),
            )}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 6,
          }}>
            {['00', '06', '12', '18', '23'].map((h) => (
              <span key={h} className="mono" style={{
                fontSize: px(9), color: 'var(--nyx-txt-3)',
              }}>{h}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: 'var(--nyx-bg-1)', padding: 16 }}>
      <div className="eyebrow">{label}</div>
      <div className="mono" style={{
        fontSize: px(22), color: 'var(--nyx-txt-1)', marginTop: 8,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div className="mono" style={{
        fontSize: px(10), color: 'var(--nyx-txt-3)', marginTop: 4,
      }}>{sub}</div>
    </div>
  )
}

function Panel(
  { label, sub, children }: { label: string; sub: string; children: React.ReactNode },
) {
  return (
    <section>
      <div className="eyebrow" style={{
        paddingBottom: 8, borderBottom: '1px solid var(--nyx-line)', marginBottom: 14,
      }}>{label}</div>
      <div className="mono" style={{
        fontSize: px(9.5), color: 'var(--nyx-txt-3)', marginBottom: 14,
      }}>{sub}</div>
      {children}
    </section>
  )
}

function hours(seconds: number): string {
  const h = seconds / 3600
  if (h < 1) return `${Math.round(seconds / 60)}m`
  return h < 10 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`
}
