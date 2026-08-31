import { useQuery } from '@tanstack/react-query'
import type { SubsonicClient } from '../api/subsonic.js'
import type { SubsonicAlbum } from '../api/types.js'
import { usePlayer } from '../player.js'
import { duration } from '../format.js'

export function Albums({ client }: { client: SubsonicClient }) {
  const playAlbum = usePlayer((s) => s.playAlbum)

  const { data: albums, isLoading, error } = useQuery({
    queryKey: ['albums'],
    queryFn: () => client.getAlbums('alphabeticalByArtist', 500),
  })

  async function play(album: SubsonicAlbum) {
    const full = await client.getAlbum(album.id)
    playAlbum(full.song, 0)
  }

  if (isLoading) return <Msg>Reading the shelves…</Msg>
  if (error) return <Msg tone="negative">{(error as Error).message}</Msg>
  if (!albums?.length) return <Msg>Nothing on the shelves yet.</Msg>

  const tracks = albums.reduce((n, a) => n + a.songCount, 0)

  return (
    <div style={{ padding: 'var(--nyx-pad-screen-desktop)' }}>
      <header style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 'var(--nyx-s-5)', flexWrap: 'wrap',
        borderBottom: '1px solid var(--nyx-line)',
        paddingBottom: 'var(--nyx-s-4)', marginBottom: 'var(--nyx-s-6)',
      }}>
        <h1 className="display" style={{ margin: 0, fontSize: 34, fontWeight: 400 }}>Albums</h1>
        {/* The counts are how a finite collection shows its edges. */}
        <span className="mono" style={{ fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)' }}>
          {albums.length} albums · {tracks} tracks
        </span>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 'var(--nyx-gutter-desktop)',
      }}>
        {albums.map((album) => (
          <button
            key={album.id}
            onClick={() => void play(album)}
            style={{ textAlign: 'left', display: 'grid', gap: 8 }}
          >
            <img
              src={client.coverArtUrl(album.coverArt, 400)}
              alt=""
              loading="lazy"
              style={{
                width: '100%', aspectRatio: '1', objectFit: 'cover',
                borderRadius: 'var(--nyx-r-sleeve)',
                background: 'var(--nyx-bg-2)',
                boxShadow: 'var(--nyx-e-1)',
                // Keeps pale sleeves from bleeding into the background.
                outline: '1px solid oklch(1 0 0 / 0.08)', outlineOffset: -1,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div className="display" style={{
                fontSize: 'var(--nyx-t-body-md)', lineHeight: 1.25,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>{album.name}</div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', gap: 8,
                fontSize: 11, color: 'var(--nyx-txt-2)', marginTop: 2,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {album.artist}
                </span>
                <span className="mono" style={{ flex: 'none', color: 'var(--nyx-txt-3)' }}>
                  {album.year || '—'}
                </span>
              </div>
              <div className="mono" style={{
                fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', marginTop: 2,
              }}>
                {album.songCount} · {duration(album.duration)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Msg({ children, tone }: { children: React.ReactNode; tone?: 'negative' }) {
  return (
    <div style={{ padding: 'var(--nyx-pad-screen-desktop)' }}>
      <p className="display" style={{
        fontSize: 26, fontWeight: 300,
        color: tone === 'negative' ? 'var(--nyx-negative)' : 'var(--nyx-txt-2)',
      }}>{children}</p>
    </div>
  )
}
