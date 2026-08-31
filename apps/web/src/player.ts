/**
 * Binds the headless engine to React via Zustand.
 *
 * The engine owns playback; this is only a subscription so components can
 * render it. Playback state updates several times a second and deliberately
 * does not go through TanStack Query (D6).
 */
import { create } from 'zustand'
import { NyxPlayer } from '@nyx/player'
import type { PlayerState, Track } from '@nyx/player'
import type { SubsonicClient } from './api/subsonic.js'
import type { SubsonicSong } from './api/types.js'

/** OpenSubsonic song → the engine's Track. ReplayGain comes straight from
 *  the tags beets wrote at import. */
export function toTrack(song: SubsonicSong): Track {
  const t: Track = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: song.duration,
  }
  const rg = song.replayGain
  if (rg?.trackGain !== undefined) t.replayGainTrackDb = rg.trackGain
  if (rg?.albumGain !== undefined) t.replayGainAlbumDb = rg.albumGain
  if (rg?.trackPeak !== undefined) t.replayGainTrackPeak = rg.trackPeak
  if (rg?.albumPeak !== undefined) t.replayGainAlbumPeak = rg.albumPeak
  return t
}

interface PlayerStore extends PlayerState {
  engine: NyxPlayer | null
  attach: (client: SubsonicClient) => NyxPlayer
  playAlbum: (songs: SubsonicSong[], startIndex?: number) => void
}

const EMPTY: PlayerState = {
  queue: [], index: -1, status: 'idle', position: 0, duration: 0,
  path: null, gain: null, outputSampleRate: 0, error: null,
}

export const usePlayer = create<PlayerStore>((set, get) => ({
  ...EMPTY,
  engine: null,

  attach(client) {
    const existing = get().engine
    if (existing) return existing

    const engine = new NyxPlayer({
      // 44.1 kHz is the library's native rate, so this avoids resampling for
      // almost everything — and lets the signal path report the truth.
      createContext: () => new AudioContext({ sampleRate: 44100 }),
      fetchAudio: async (track, signal) => {
        const res = await fetch(client.streamUrl(track.id), { signal })
        if (!res.ok) throw new Error(`stream ${res.status}`)
        return res.arrayBuffer()
      },
      streamUrl: (track) => client.streamUrl(track.id),
      createAudioElement: () => {
        const el = new Audio()
        el.preload = 'auto'
        return el
      },
      mediaSession: 'mediaSession' in navigator ? navigator.mediaSession : null,
    })

    engine.subscribe((s) => set(s))
    set({ engine })
    return engine
  },

  playAlbum(songs, startIndex = 0) {
    const engine = get().engine
    if (!engine) return
    void engine.load(songs.map(toTrack), startIndex)
  },
}))
