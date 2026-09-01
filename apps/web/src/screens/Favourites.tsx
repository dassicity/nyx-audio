import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useClient } from '../api/context.js'
import { Screen, ScreenHeader, Placeholder } from '../components/Screen.js'

export function Favourites() {
  const client = useClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['starred'],
    queryFn: () => client.getStarred(),
  })

  if (isLoading) return <Placeholder title="Reading the shelves…" />
  if (error) return <Placeholder title="Could not read favourites." tone="negative"
    lines={[(error as Error).message]} />

  const albums = data?.albums ?? []
  if (albums.length === 0) {
    return <Placeholder title="Nothing loved yet."
      lines={['Star an album and it appears here.', '', 'Loved, not liked. No algorithm reads this.']} />
  }

  return (
    <Screen>
      <ScreenHeader
        title="Favourites" meta={`${albums.length} albums`}
        sub="loved, not liked · no algorithm reads this"
      />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 'var(--nyx-gutter-desktop)',
      }}>
        {albums.map((a) => (
          <Link key={a.id} to={`/album/${a.id}`} style={{
            textDecoration: 'none', color: 'inherit', display: 'grid', gap: 8,
          }}>
            <img src={client.coverArtUrl(a.coverArt, 400)} alt="" loading="lazy" style={{
              width: '100%', aspectRatio: '1', objectFit: 'cover',
              borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
              boxShadow: 'var(--nyx-e-1)',
              outline: '1px solid oklch(1 0 0 / 0.08)', outlineOffset: -1,
            }} />
            <div className="display" style={{
              fontSize: 'var(--nyx-t-body-md)', lineHeight: 1.25,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>{a.name}</div>
          </Link>
        ))}
      </div>
    </Screen>
  )
}
