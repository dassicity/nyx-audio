import { useQuery } from '@tanstack/react-query'
import { fetchLyrics } from '../api/lyrics.js'
import type { Track } from '@nyx/player'

export function useLyrics(track: Track | undefined) {
  return useQuery({
    queryKey: ['lyrics', track?.id],
    queryFn: ({ signal }) => fetchLyrics({
      title: track!.title, artist: track!.artist,
      album: track!.album, duration: track!.duration,
    }, signal),
    enabled: Boolean(track),
    // Lyrics for a given track never change. Keep them for the session and
    // do not retry a 404 — "nobody transcribed this" is a real answer.
    staleTime: Infinity,
    retry: false,
  })
}
