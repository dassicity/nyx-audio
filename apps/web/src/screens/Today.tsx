import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAlbums } from '../hooks/library.js'
import { useClient } from '../api/context.js'
import { selectCandidates, loadBuried } from '../crate/select.js'
import { Screen, Placeholder } from '../components/Screen.js'
import { px } from '../format.js'

/** Not a feed. A finite, dated snapshot with edges. */
export function Today() {
  const client = useClient()
  const { data: albums, isLoading } = useAlbums()

  const recent = useQuery({
    queryKey: ['albums', 'recent'],
    queryFn: () => client.getAlbums('recent', 6),
  })
  const newest = useQuery({
    queryKey: ['albums', 'newest'],
    queryFn: () => client.getAlbums('newest', 8),
  })

  const cold = useMemo(
    () => selectCandidates(albums ?? [], loadBuried(), Date.now()),
    [albums],
  )

  if (isLoading) return <Placeholder title="Reading the shelves…" />

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning'
    : hour < 18 ? 'Good afternoon' : 'Good evening'
  const pick = cold[0]

  return (
    <Screen>
      <header style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 'var(--nyx-s-5)', flexWrap: 'wrap',
        borderBottom: '1px solid var(--nyx-line)',
        paddingBottom: 'var(--nyx-s-4)', marginBottom: 'var(--nyx-s-6)',
      }}>
        <h1 className="display" style={{ margin: 0, fontSize: px(34), fontWeight: 300 }}>
          {greeting}
        </h1>
        <span className="mono" style={{
          fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
        }}>
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          {' · '}
          {now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase()}
          {' · '}{albums?.length ?? 0} albums on the shelf
        </span>
      </header>

      {(recent.data?.length ?? 0) > 0 && (
        <Section label="Recently played">
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10,
          }}>
            {recent.data!.map((a) => (
              <Link key={a.id} to={`/album/${a.id}`} style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: 8,
                border: '1px solid var(--nyx-line-soft)', borderRadius: 'var(--nyx-r-2)',
                background: 'var(--nyx-bg-1)', textDecoration: 'none', color: 'inherit',
              }}>
                <img src={client.coverArtUrl(a.coverArt, 112)} alt="" style={{
                  width: 56, height: 56, flex: 'none', objectFit: 'cover',
                  borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
                }} />
                <div style={{ minWidth: 0 }}>
                  <div className="display" style={ellipsis}>{a.name}</div>
                  <div style={{ ...ellipsis, fontSize: px(11.5), color: 'var(--nyx-txt-2)' }}>{a.artist}</div>
                  <div className="mono" style={{
                    fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', marginTop: 2,
                  }}>{a.playCount ?? 0} plays</div>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 'var(--nyx-s-6)', marginTop: 'var(--nyx-s-7)',
      }}>
        {pick && (
          <Section label="Today's crate pick">
            <Link to="/crate" style={{
              display: 'flex', gap: 14, padding: 12, textDecoration: 'none', color: 'inherit',
              border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
              background: 'var(--nyx-bg-1)',
            }}>
              <img src={client.coverArtUrl(pick.album.coverArt, 192)} alt="" style={{
                width: 96, height: 96, flex: 'none', objectFit: 'cover',
                borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
              }} />
              <div style={{ minWidth: 0 }}>
                <div className="display" style={{ fontSize: px(20), lineHeight: 1.2 }}>
                  {pick.album.name}
                </div>
                <p className="mono" style={{
                  margin: '8px 0 0', fontSize: 'var(--nyx-t-mono-xs)',
                  color: 'var(--nyx-txt-3)', lineHeight: 1.7,
                }}>{pick.reason}</p>
              </div>
            </Link>
          </Section>
        )}

        <Section label="Unplayed longest">
          {cold.slice(0, 4).map((c) => (
            <Link key={c.album.id} to={`/album/${c.album.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
              borderBottom: '1px solid var(--nyx-line-soft)',
              textDecoration: 'none', color: 'inherit',
            }}>
              <img src={client.coverArtUrl(c.album.coverArt, 72)} alt="" style={{
                width: 36, height: 36, flex: 'none', objectFit: 'cover',
                borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="display" style={{ ...ellipsis, fontSize: px(14) }}>{c.album.name}</div>
                <div style={{ ...ellipsis, fontSize: px(11), color: 'var(--nyx-txt-2)' }}>{c.album.artist}</div>
              </div>
              <span className="mono" style={{
                fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', flex: 'none',
              }}>{c.album.playCount ? 'cold' : 'never'}</span>
            </Link>
          ))}
        </Section>
      </div>

      {(newest.data?.length ?? 0) > 0 && (
        <div style={{ marginTop: 'var(--nyx-s-7)' }}>
          <Section label="Recently added">
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 10,
            }}>
              {newest.data!.map((a) => (
                <Link key={a.id} to={`/album/${a.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <img src={client.coverArtUrl(a.coverArt, 168)} alt="" style={{
                    width: '100%', aspectRatio: '1', objectFit: 'cover',
                    borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
                    boxShadow: 'var(--nyx-e-1)',
                  }} />
                  <div style={{
                    ...ellipsis, fontSize: px(10.5), marginTop: 5, color: 'var(--nyx-txt-2)',
                  }}>{a.name}</div>
                </Link>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* "On this day" genuinely needs the play-event log. Saying so beats
          inventing something from data that does not exist. */}
      <div style={{ marginTop: 'var(--nyx-s-7)', maxWidth: '60ch' }}>
        <Section label="On this day">
          <div style={{
            border: '1px dashed var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
            padding: 'var(--nyx-s-5)', opacity: 0.72,
          }}>
            <p className="mono" style={{
              margin: 0, fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)', lineHeight: 1.8,
            }}>
              Needs the play-event log. Navidrome records enough for its own UI;
              this wants every play with its timestamp, which is nyx-api&rsquo;s job.
            </p>
          </div>
        </Section>
      </div>
    </Screen>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: 12 }}>{label}</div>
      {children}
    </section>
  )
}

const ellipsis: React.CSSProperties = {
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  fontSize: px(14),
}
