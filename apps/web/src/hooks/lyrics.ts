import { useQuery } from '@tanstack/react-query'
import { fetchLyrics } from '../api/lyrics.js'
import { getLyrics } from '../api/nyx.js'
import type { Lyrics } from '../api/lyrics.js'
import type { Track } from '@nyx/player'

export function useLyrics(track: Track | undefined) {
  return useQuery({
    queryKey: ['lyrics', track?.id],
    queryFn: async ({ signal }): Promise<Lyrics> => {
      // Prefer nyx-api: it caches, so a Pi that has seen a lyric once serves
      // it forever, including offline. Fall back to lrclib directly when the
      // service is not deployed.
      try {
        const r = await getLyrics(track!.title, track!.artist, track!.album, track!.duration)
        if (r.kind === 'synced' && r.lines) return { kind: 'synced', lines: r.lines }
        if (r.kind === 'plain' && r.text) return { kind: 'plain', text: r.text }
        if (r.kind === 'instrumental') return { kind: 'instrumental' }
        return { kind: 'absent' }
      } catch {
        return fetchLyrics({
          title: track!.title, artist: track!.artist,
          album: track!.album, duration: track!.duration,
        }, signal)
      }
    },
    enabled: Boolean(track),
    // Lyrics for a given track never change. Keep them for the session and
    // do not retry a 404 — "nobody transcribed this" is a real answer.
    staleTime: Infinity,
    retry: false,
  })
}
