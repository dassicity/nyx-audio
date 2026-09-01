/**
 * Server state (D6): library reads through TanStack Query, which gives
 * caching and stale-while-revalidate — the right behaviour for a LAN client
 * whose server is occasionally asleep.
 */
import { useQuery } from '@tanstack/react-query'
import { useClient } from '../api/context.js'

export function useAlbums() {
  const client = useClient()
  return useQuery({
    queryKey: ['albums'],
    queryFn: () => client.getAlbums('alphabeticalByArtist', 500),
  })
}

export function useAlbum(id: string | undefined) {
  const client = useClient()
  return useQuery({
    queryKey: ['album', id],
    queryFn: () => client.getAlbum(id!),
    enabled: Boolean(id),
  })
}

export function useArtists() {
  const client = useClient()
  return useQuery({ queryKey: ['artists'], queryFn: () => client.getArtists() })
}

/** Counts for the sidebar. They are the point: a finite collection should
 *  show its edges, so these are always visible rather than on hover. */
export function useLibraryStats() {
  const albums = useAlbums()
  const artists = useArtists()

  const list = albums.data ?? []
  const genres = new Set(list.map((a) => a.genre).filter(Boolean))

  return {
    albums: list.length,
    artists: artists.data?.length ?? 0,
    genres: genres.size,
    tracks: list.reduce((n, a) => n + a.songCount, 0),
    duration: list.reduce((n, a) => n + a.duration, 0),
    isLoading: albums.isLoading || artists.isLoading,
  }
}
