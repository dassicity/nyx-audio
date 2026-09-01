import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAlbums } from '../hooks/library.js'
import { useClient } from '../api/context.js'
import { Screen, ScreenHeader, Placeholder } from '../components/Screen.js'
import { px } from '../format.js'

/**
 * Grouped from the album list rather than getArtists, because that is what
 * lets a concert series be detected — the server has no concept of one.
 */
export function Artists() {
  const { data: albums, isLoading } = useAlbums()
  const client = useClient()

  const artists = useMemo(() => {
    const by = new Map<string, typeof albums extends undefined ? never : NonNullable<typeof albums>>()
    for (const a of albums ?? []) {
      const list = by.get(a.artist) ?? []
      list.push(a)
      by.set(a.artist, list)
    }
    return [...by.entries()]
      .map(([name, list]) => ({
        name,
        albums: list,
        plays: list.reduce((n, a) => n + (a.playCount ?? 0), 0),
        series: detectSeries(list.map((a) => a.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [albums])

  if (isLoading) return <Placeholder title="Reading the shelves…" />

  return (
    <Screen>
      <ScreenHeader title="Artists" meta={`${artists.length} artists`} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '2px 26px',
      }}>
        {artists.map((artist) => (
          <div key={artist.name} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
            borderBottom: '1px solid var(--nyx-line-soft)',
          }}>
            <img
              src={client.coverArtUrl(artist.albums[0]?.coverArt, 72)} alt=""
              style={{
                width: 36, height: 36, flex: 'none', objectFit: 'cover',
                borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="display" style={{
                fontSize: px(14.5), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{artist.name}</div>
              {/* A 22-volume concert series should not read as 22 albums. */}
              {artist.series && (
                <div className="mono" style={{
                  fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', marginTop: 2,
                }}>
                  incl. {artist.series.count}-volume series · {artist.series.label}
                </div>
              )}
            </div>
            <span className="mono" style={{
              fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', flex: 'none',
            }}>{artist.albums.length} · {artist.plays} plays</span>
          </div>
        ))}
      </div>
    </Screen>
  )
}

/**
 * Detect a numbered series — "… Vol. 141", "… Vol. 156".
 *
 * The design handoff has no concept of this, and its mock data could not have
 * surfaced the need: its many-album extreme was fourteen discrete albums.
 * A real library of live recordings behaves completely differently.
 */
export function detectSeries(names: string[]): { count: number; label: string } | null {
  const volumes = names.filter((n) => /\bvol\.?\s*\d+/i.test(n))
  if (volumes.length < 4) return null

  // Strip the volume marker and take the longest shared prefix as the label.
  const stems = volumes.map((n) => n.replace(/\s*[,·-]?\s*vol\.?\s*\d+.*$/i, '').trim())
  const words = stems[0]!.split(/\s+/)
  let shared = ''
  for (let i = words.length; i > 0; i--) {
    const candidate = words.slice(0, i).join(' ')
    if (stems.every((s) => s.startsWith(candidate))) { shared = candidate; break }
  }
  return { count: volumes.length, label: shared || 'concerts' }
}
