import { useMemo } from 'react'
import { useAlbums } from '../hooks/library.js'
import { Screen, ScreenHeader, Placeholder } from '../components/Screen.js'
import { px } from '../format.js'

/** Fixed, warm-family hues — semantic, and deliberately not the artwork accent. */
const GENRE_HUE: Record<string, number> = {
  jazz: 62, rock: 28, electronic: 96, ambient: 128, classical: 44,
  hindustani: 12, qawwali: 12, world: 78, folk: 100, soundtrack: 50,
}

function hueFor(genre: string): number {
  const key = genre.toLowerCase()
  for (const [k, h] of Object.entries(GENRE_HUE)) if (key.includes(k)) return h
  // Stable hash so an unknown genre keeps the same colour between visits.
  let hash = 0
  for (let i = 0; i < genre.length; i++) hash = (hash * 31 + genre.charCodeAt(i)) % 360
  return hash
}

export function Genres() {
  const { data: albums, isLoading } = useAlbums()

  const genres = useMemo(() => {
    const by = new Map<string, { albums: number; tracks: number }>()
    for (const a of albums ?? []) {
      const g = a.genre?.trim()
      if (!g) continue
      const e = by.get(g) ?? { albums: 0, tracks: 0 }
      e.albums++
      e.tracks += a.songCount
      by.set(g, e)
    }
    return [...by.entries()].sort((a, b) => b[1].albums - a[1].albums)
  }, [albums])

  if (isLoading) return <Placeholder title="Reading the shelves…" />
  if (genres.length === 0) {
    return <Placeholder title="No genres tagged yet."
      lines={['beets writes genre tags at import.', '', 'MusicBrainz enrichment arrives with nyx-api.']} />
  }

  return (
    <Screen>
      <ScreenHeader title="Genres" meta={`${genres.length} genres`} sub="from file tags · musicbrainz enrichment pending" />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10,
      }}>
        {genres.map(([name, e]) => (
          <div key={name} style={{
            minHeight: 110, padding: 18, borderRadius: 'var(--nyx-r-2)',
            border: '1px solid var(--nyx-line)',
            background: `linear-gradient(160deg, oklch(0.30 0.075 ${hueFor(name)}) 0%, transparent 90%)`,
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}>
            <div className="display" style={{ fontSize: px(22), lineHeight: 1.15 }}>{name}</div>
            <div className="mono" style={{
              fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', marginTop: 6,
            }}>{e.albums} albums · {e.tracks} tracks</div>
          </div>
        ))}
      </div>
    </Screen>
  )
}
