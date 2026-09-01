import { Link } from 'react-router-dom'
import { useAlbums } from '../hooks/library.js'
import { useClient } from '../api/context.js'
import { duration, px } from '../format.js'
import { Screen, ScreenHeader, Placeholder } from '../components/Screen.js'

export function Albums() {
  const client = useClient()
  const { data: albums, isLoading, error } = useAlbums()

  if (isLoading) return <Placeholder title="Reading the shelves…" />
  if (error) return <Placeholder title="The server did not answer." tone="negative"
    lines={[(error as Error).message, '', 'Playback of anything already loaded is unaffected.']} />
  if (!albums?.length) return <Placeholder title="Nothing on the shelves yet."
    lines={['Point Nyx at a folder of FLACs and it will do the rest.']} />

  const tracks = albums.reduce((n, a) => n + a.songCount, 0)

  return (
    <Screen>
      <ScreenHeader
        title="Albums"
        meta={`${albums.length} albums · ${tracks} tracks · ${duration(albums.reduce((n, a) => n + a.duration, 0))}`}
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 'var(--nyx-gutter-desktop)',
      }}>
        {albums.map((album) => (
          <Link key={album.id} to={`/album/${album.id}`}
            style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gap: 8 }}>
            <img
              src={client.coverArtUrl(album.coverArt, 400)} alt="" loading="lazy"
              style={{
                width: '100%', aspectRatio: '1', objectFit: 'cover',
                borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
                boxShadow: 'var(--nyx-e-1)',
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
                fontSize: px(11), color: 'var(--nyx-txt-2)', marginTop: 2,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {album.artist}
                </span>
                <span className="mono" style={{ flex: 'none', color: 'var(--nyx-txt-3)' }}>
                  {album.year || '—'}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Screen>
  )
}
