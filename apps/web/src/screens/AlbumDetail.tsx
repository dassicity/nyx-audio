import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAlbum } from '../hooks/library.js'
import { useClient } from '../api/context.js'
import { usePlayer } from '../player.js'
import { usePalette } from '../palette/usePalette.js'
import { safeTextOnWash, WASH_OPACITY } from '../palette/palette.js'
import { duration, signalPath, titleSize, px } from '../format.js'
import { Placeholder } from '../components/Screen.js'
import type { SubsonicSong } from '../api/types.js'

// Album detail floods the wash to 0.95, where txt-3 does not clear WCAG AA.
// This resolves to txt-2 here. See palette.ts for the measurements.
const WASH_TEXT = `var(--nyx-${safeTextOnWash(WASH_OPACITY.flooded)})`

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>()
  const client = useClient()
  const { data: album, isLoading, error } = useAlbum(id)
  const [flipped, setFlipped] = useState(false)
  const playAlbum = usePlayer((s) => s.playAlbum)
  const current = usePlayer((s) => s.queue[s.index])

  const cover = client.coverArtUrl(album?.coverArt, 600)
  usePalette(cover)

  // `F` turns the sleeve over — the one memorable interaction on this screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f' && !isTyping(e)) setFlipped((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (isLoading) return <Placeholder title="Reading the sleeve…" />
  if (error) return <Placeholder title="Could not read that album." tone="negative"
    lines={[(error as Error).message]} />
  if (!album) return <Placeholder title="No such album." />

  const songs = album.song
  const isCompilation = new Set(songs.map((s) => s.artist)).size > 3
  const longForm = songs.length > 0 && songs.every((s) => s.duration > 15 * 60)
  const first = songs[0]

  const eyebrow = longForm ? `Single work · ${numberWord(songs.length)} movements`
    : isCompilation ? `Compilation · ${songs.length} tracks`
    : `${album.genre ?? 'Album'} · album`

  return (
    <div style={{ padding: 'var(--nyx-pad-screen-desktop)' }}>
      {/* ── head ── */}
      <div style={{ display: 'flex', gap: 'var(--nyx-s-7)', flexWrap: 'wrap' }}>
        <div style={{ width: 340, maxWidth: '100%', flex: 'none' }}>
          <div style={{ position: 'relative' }}>
            <div aria-hidden style={{
              position: 'absolute', inset: '-14%', borderRadius: '50%',
              background: 'radial-gradient(circle, var(--nyx-art-glow), transparent 70%)',
              filter: 'blur(56px)', opacity: 0.62,
              transition: 'background var(--nyx-dur-slow) var(--nyx-ease)',
            }} />
            <Sleeve url={cover} alt={album.name} flipped={flipped}
              onClick={() => setFlipped((v) => !v)} />
          </div>
          <div className="mono" style={{
            marginTop: 10, fontSize: 'var(--nyx-t-mono-sm)', color: WASH_TEXT,
          }}>F · turn the sleeve over</div>
        </div>

        <div style={{
          flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end', gap: 10,
        }}>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="display" style={{
            margin: 0, fontWeight: 300, lineHeight: 1.06,
            fontSize: titleSize(album.name),
          }}>{album.name}</h1>
          <Link to={`/artists`} className="display" style={{
            fontSize: px(20), color: 'var(--nyx-txt-2)', textDecoration: 'none',
          }}>{album.artist}</Link>

          <div className="mono" style={{
            fontSize: 'var(--nyx-t-mono-sm)', color: WASH_TEXT, marginTop: 2,
          }}>
            {[album.year, album.genre, `${songs.length} tracks`, duration(album.duration),
              signalPath(first?.suffix, first?.bitDepth, first?.samplingRate, first?.bitRate),
            ].filter(Boolean).join(' · ')}
          </div>

          {/* The provenance line: a factual biography of THIS copy. No
              streaming service can render this sentence. */}
          <div className="mono" style={{
            fontSize: 'var(--nyx-t-mono-sm)', color: WASH_TEXT,
            maxWidth: '60ch', lineHeight: 1.7,
          }}>{provenance(album.playCount, songs)}</div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={() => playAlbum(songs, 0)} style={primaryBtn}>▶ Play</button>
            <button onClick={() => playAlbum(songs, 0)} style={secondaryBtn}>Add to queue</button>
          </div>
        </div>
      </div>

      {/* ── faces ── */}
      <div style={{ marginTop: 'var(--nyx-s-7)' }}>
        {flipped
          ? <BackOfSleeve album={album} songs={songs} />
          : <Tracklist songs={songs} showArtist={isCompilation}
              currentId={current?.id} onPlay={(i) => playAlbum(songs, i)} />}
      </div>
    </div>
  )
}

function Sleeve(
  { url, alt, flipped, onClick }:
  { url: string | undefined; alt: string; flipped: boolean; onClick: () => void },
) {
  return (
    <button onClick={onClick} aria-label="Turn the sleeve over" style={{
      display: 'block', width: '100%', aspectRatio: '1', position: 'relative',
      borderRadius: 'var(--nyx-r-sleeve)', overflow: 'hidden',
      boxShadow: 'var(--nyx-e-2)',
      transform: flipped ? 'rotateY(-4deg)' : 'none',
      transition: 'transform var(--nyx-dur-mid) var(--nyx-ease)',
    }}>
      {url
        ? <img src={url} alt={alt} style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            outline: '1px solid oklch(1 0 0 / 0.08)', outlineOffset: -1,
          }} />
        : <NoArtwork />}
    </button>
  )
}

/** Missing art is designed, not broken. */
function NoArtwork() {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'grid', placeContent: 'center',
      gap: 4, textAlign: 'center',
      background:
        'repeating-linear-gradient(45deg, var(--nyx-bg-2) 0 10px, var(--nyx-bg-1) 10px 20px)',
    }}>
      <div className="mono" style={{
        fontSize: 'var(--nyx-t-mono-sm)', letterSpacing: 'var(--nyx-ls-eyebrow)',
        color: 'var(--nyx-txt-2)',
      }}>NO ARTWORK</div>
      <div className="mono" style={{ fontSize: px(9.5), color: 'var(--nyx-txt-3)' }}>
        cover.jpg not found
      </div>
    </div>
  )
}

function Tracklist(
  { songs, showArtist, currentId, onPlay }:
  { songs: SubsonicSong[]; showArtist: boolean; currentId: string | undefined; onPlay: (i: number) => void },
) {
  const cols = `30px 1fr ${showArtist ? '170px ' : ''}120px 56px 54px`
  return (
    <div>
      <div className="eyebrow" style={{
        display: 'grid', gridTemplateColumns: cols, gap: 12,
        padding: '0 8px 8px', borderBottom: '1px solid var(--nyx-line)',
      }}>
        <span>#</span><span>Title</span>
        {showArtist && <span>Artist</span>}
        <span style={{ textAlign: 'right' }}>Format</span>
        <span style={{ textAlign: 'right' }}>Plays</span>
        <span style={{ textAlign: 'right' }}>Time</span>
      </div>

      {songs.map((song, i) => (
        <button
          key={song.id}
          onClick={() => onPlay(i)}
          style={{
            display: 'grid', gridTemplateColumns: cols, gap: 12, width: '100%',
            padding: '10px 8px', textAlign: 'left', alignItems: 'center',
            borderBottom: '1px solid var(--nyx-line-soft)',
            borderRadius: 'var(--nyx-r-1)',
            background: song.id === currentId ? 'var(--nyx-bg-2)' : 'transparent',
          }}
        >
          <span className="mono" style={{
            fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
          }}>{song.track ?? i + 1}</span>

          {/* Wraps rather than truncating — movement titles need the room. */}
          <span className="display" style={{
            fontSize: 'var(--nyx-t-body-md)', lineHeight: 1.35,
          }}>{song.title}</span>

          {showArtist && (
            <span style={{
              fontSize: px(11.5), color: 'var(--nyx-txt-2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{song.artist}</span>
          )}

          <span className="mono" style={{ ...cell, textAlign: 'right' }}>
            {signalPath(song.suffix, song.bitDepth, song.samplingRate, song.bitRate)}
          </span>
          <span className="mono" style={{ ...cell, textAlign: 'right' }}>
            {song.playCount ?? 0}
          </span>
          <span className="mono" style={{ ...cell, textAlign: 'right' }}>
            {duration(song.duration)}
          </span>
        </button>
      ))}
    </div>
  )
}

function BackOfSleeve(
  { album, songs }: { album: { name: string; artist: string; year?: number }; songs: SubsonicSong[] },
) {
  const first = songs[0]
  const rows: [string, string][] = [
    ['Release', [album.artist, album.name, album.year].filter(Boolean).join(' · ')],
    ['Encoding', signalPath(first?.suffix, first?.bitDepth, first?.samplingRate, first?.bitRate) || '—'],
    ['Tracks', `${songs.length} · ${duration(songs.reduce((n, s) => n + s.duration, 0))}`],
    ['ReplayGain', first?.replayGain?.albumGain !== undefined
      ? `album ${first.replayGain.albumGain.toFixed(2)} dB`
      : 'not scanned'],
  ]

  return (
    <div style={{ display: 'grid', gap: 'var(--nyx-s-6)', maxWidth: '74ch' }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Technical</div>
        {rows.map(([k, v]) => (
          <div key={k} className="mono" style={{
            display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12,
            fontSize: 'var(--nyx-t-mono-sm)', padding: '7px 0',
            borderBottom: '1px solid var(--nyx-line-soft)',
          }}>
            <span style={{ color: 'var(--nyx-txt-3)' }}>{k}</span>
            <span style={{ color: 'var(--nyx-txt-1)' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Enrichment is network-dependent; absent is a designed state. */}
      <div style={{
        border: '1px dashed var(--nyx-line)', borderRadius: 'var(--nyx-r-3)',
        padding: 'var(--nyx-s-5)',
      }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Release context</div>
        <div className="mono" style={{
          fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)', lineHeight: 1.8,
        }}>
          Not fetched yet. MusicBrainz enrichment arrives with nyx-api.
        </div>
      </div>
    </div>
  )
}

function provenance(albumPlays: number | undefined, songs: SubsonicSong[]): string {
  const plays = albumPlays ?? songs.reduce((n, s) => n + (s.playCount ?? 0), 0)
  const hires = songs.some((s) => (s.bitDepth ?? 16) > 16 || (s.samplingRate ?? 44100) > 44100)
  const parts = [
    plays > 0 ? `${plays} plays` : 'Never played',
    hires ? 'hi-res · resampled by the browser mixer' : 'never resampled',
  ]
  return parts.join(' · ')
}

function numberWord(n: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n)
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

const cell: React.CSSProperties = {
  fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
}
const primaryBtn: React.CSSProperties = {
  minHeight: 'var(--nyx-hit-min)', padding: '0 22px', fontWeight: 700,
  background: 'var(--nyx-txt-1)', color: 'var(--nyx-bg-0)',
  borderRadius: 'var(--nyx-r-2)',
}
const secondaryBtn: React.CSSProperties = {
  minHeight: 'var(--nyx-hit-min)', padding: '0 18px',
  border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
  color: 'var(--nyx-txt-2)',
}
