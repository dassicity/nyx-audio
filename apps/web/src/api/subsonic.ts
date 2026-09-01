/**
 * OpenSubsonic client.
 *
 * Talks to Navidrome through Caddy on the same origin, so every path is
 * relative — no CORS, and the same code works on the LAN over HTTP and over
 * the tailnet with TLS.
 *
 * Authentication is salt + token, not a plaintext password: the Subsonic
 * `p=` parameter would put the password in every URL, and therefore in
 * proxy logs and browser history.
 */
import { md5, makeSalt } from './md5.js'
import { SubsonicError } from './types.js'
import type {
  ScanStatus, SubsonicAlbum, SubsonicArtist, SubsonicPlaylist, SubsonicSong,
} from './types.js'

const CLIENT = 'nyx'
const API_VERSION = '1.16.1'

export interface Credentials {
  username: string
  password: string
}

export type AlbumListType =
  | 'newest' | 'recent' | 'frequent' | 'alphabeticalByName'
  | 'alphabeticalByArtist' | 'starred' | 'random' | 'byYear'

export class SubsonicClient {
  #creds: Credentials
  #baseUrl: string

  constructor(creds: Credentials, baseUrl = '') {
    this.#creds = creds
    this.#baseUrl = baseUrl.replace(/\/$/, '')
  }

  /** Auth params, freshly salted per request as the protocol intends. */
  #auth(): Record<string, string> {
    const salt = makeSalt()
    return {
      u: this.#creds.username,
      t: md5(this.#creds.password + salt),
      s: salt,
      v: API_VERSION,
      c: CLIENT,
      f: 'json',
    }
  }

  url(endpoint: string, params: Record<string, string | number | undefined> = {}): string {
    const qs = new URLSearchParams(this.#auth())
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v))
    }
    return `${this.#baseUrl}/rest/${endpoint}?${qs}`
  }

  async #get<T>(endpoint: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const res = await fetch(this.url(endpoint, params))
    if (!res.ok) throw new SubsonicError(0, `${res.status} ${res.statusText}`)

    const body = await res.json() as { 'subsonic-response': Record<string, unknown> }
    const payload = body['subsonic-response']
    if (payload?.['status'] !== 'ok') {
      const err = payload?.['error'] as { code?: number; message?: string } | undefined
      throw new SubsonicError(err?.code ?? 0, err?.message ?? 'Unknown Subsonic error')
    }
    return payload as T
  }

  async ping(): Promise<boolean> {
    await this.#get('ping.view')
    return true
  }

  async getScanStatus(): Promise<ScanStatus> {
    const r = await this.#get<{ scanStatus: ScanStatus }>('getScanStatus.view')
    return r.scanStatus
  }

  async getAlbums(
    type: AlbumListType = 'alphabeticalByArtist',
    size = 500,
    offset = 0,
  ): Promise<SubsonicAlbum[]> {
    const r = await this.#get<{ albumList2?: { album?: SubsonicAlbum[] } }>(
      'getAlbumList2.view', { type, size, offset })
    return r.albumList2?.album ?? []
  }

  async getAlbum(id: string): Promise<SubsonicAlbum & { song: SubsonicSong[] }> {
    const r = await this.#get<{ album: SubsonicAlbum & { song?: SubsonicSong[] } }>(
      'getAlbum.view', { id })
    return { ...r.album, song: r.album.song ?? [] }
  }

  async getArtists(): Promise<SubsonicArtist[]> {
    const r = await this.#get<{ artists?: { index?: { artist?: SubsonicArtist[] }[] } }>(
      'getArtists.view')
    return (r.artists?.index ?? []).flatMap((i) => i.artist ?? [])
  }

  async search(query: string, limit = 20): Promise<{
    albums: SubsonicAlbum[]; songs: SubsonicSong[]; artists: SubsonicArtist[]
  }> {
    const r = await this.#get<{
      searchResult3?: {
        album?: SubsonicAlbum[]; song?: SubsonicSong[]; artist?: SubsonicArtist[]
      }
    }>('search3.view', {
      query, albumCount: limit, songCount: limit, artistCount: limit,
    })
    return {
      albums: r.searchResult3?.album ?? [],
      songs: r.searchResult3?.song ?? [],
      artists: r.searchResult3?.artist ?? [],
    }
  }

  async getStarred(): Promise<{ albums: SubsonicAlbum[]; songs: SubsonicSong[] }> {
    const r = await this.#get<{
      starred2?: { album?: SubsonicAlbum[]; song?: SubsonicSong[] }
    }>('getStarred2.view')
    return { albums: r.starred2?.album ?? [], songs: r.starred2?.song ?? [] }
  }

  async star(albumId: string, starred: boolean): Promise<void> {
    await this.#get(starred ? 'star.view' : 'unstar.view', { albumId })
  }

  async getArtist(id: string): Promise<SubsonicArtist & { album: SubsonicAlbum[] }> {
    const r = await this.#get<{ artist: SubsonicArtist & { album?: SubsonicAlbum[] } }>(
      'getArtist.view', { id })
    return { ...r.artist, album: r.artist.album ?? [] }
  }

  async getPlaylists(): Promise<SubsonicPlaylist[]> {
    const r = await this.#get<{ playlists?: { playlist?: SubsonicPlaylist[] } }>(
      'getPlaylists.view')
    return r.playlists?.playlist ?? []
  }

  /** Cover art URL. `size` omitted returns the original. */
  coverArtUrl(coverArt: string | undefined, size?: number): string | undefined {
    if (!coverArt) return undefined
    return this.url('getCoverArt.view', { id: coverArt, size })
  }

  /**
   * Original bytes, never transcoded. `format=raw` and a zero max bitrate are
   * what keep lossless lossless — the whole point of the exercise.
   */
  streamUrl(songId: string): string {
    return this.url('stream.view', { id: songId, format: 'raw', maxBitRate: 0 })
  }

  /** Tell the server a track was played, so its own history stays accurate. */
  async scrobble(songId: string, submission = true): Promise<void> {
    await this.#get('scrobble.view', { id: songId, submission: String(submission) })
  }
}
