import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useClient } from '../api/context.js'
import { useLibraryStats } from '../hooks/library.js'
import { usePlayer } from '../player.js'
import { duration, px } from '../format.js'
import { Screen } from '../components/Screen.js'

const RECENT = ['yaman', '24 bit', 'qawwali', 'live', 'unplayed']

export function Search() {
  const client = useClient()
  const stats = useLibraryStats()
  const [q, setQ] = useState('')
  const [ask, setAsk] = useState(false)

  const { data, isFetching } = useQuery({
    queryKey: ['search', q],
    queryFn: () => client.search(q, 20),
    enabled: q.trim().length > 1 && !ask,
  })

  const total = (data?.albums.length ?? 0) + (data?.songs.length ?? 0) + (data?.artists.length ?? 0)

  return (
    <Screen>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1px solid var(--nyx-line)', paddingBottom: 'var(--nyx-s-4)',
      }}>
        <span className="mono" style={{ fontSize: px(20), color: 'var(--nyx-txt-3)' }}>/</span>
        <input
          value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          aria-label="Search the library"
          placeholder={`Search ${stats.albums} albums, ${stats.tracks} tracks…`}
          className="display"
          style={{
            flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
            fontSize: px(26), fontWeight: 300, color: 'var(--nyx-txt-1)',
          }}
        />
        <button
          onClick={() => setAsk((v) => !v)}
          className="mono"
          style={{
            flex: 'none', fontSize: px(9), letterSpacing: '0.16em', textTransform: 'uppercase',
            border: '1px dashed var(--nyx-line)', borderRadius: 'var(--nyx-r-pill)',
            padding: '5px 11px', color: 'var(--nyx-txt-3)',
            background: ask ? 'var(--nyx-bg-2)' : 'transparent',
          }}
        >Ask mode</button>
      </div>

      {ask ? <AskMode /> : !q.trim() ? <Recent onPick={setQ} /> : isFetching ? (
        <Note>Searching…</Note>
      ) : total === 0 ? (
        <NoResults albums={stats.albums} />
      ) : (
        <div style={{ marginTop: 'var(--nyx-s-6)', display: 'grid', gap: 'var(--nyx-s-6)' }}>
          {data!.albums.length > 0 && (
            <Group label="Albums" count={data!.albums.length}>
              {data!.albums.map((a) => (
                <Link key={a.id} to={`/album/${a.id}`} style={rowLink}>
                  <img src={client.coverArtUrl(a.coverArt, 72)} alt="" style={thumb} />
                  <span style={main}>{a.name}</span>
                  <span style={sub}>{a.artist}</span>
                  <span className="mono" style={meta}>{a.year ?? '—'}</span>
                </Link>
              ))}
            </Group>
          )}
          {data!.songs.length > 0 && (
            <Group label="Tracks" count={data!.songs.length}>
              {data!.songs.map((s) => <SongRow key={s.id} song={s} />)}
            </Group>
          )}
          {data!.artists.length > 0 && (
            <Group label="Artists" count={data!.artists.length}>
              {data!.artists.map((a) => (
                <div key={a.id} style={rowLink}>
                  <span style={{ ...thumb, background: 'var(--nyx-bg-2)' }} />
                  <span style={main}>{a.name}</span>
                  <span style={sub} />
                  <span className="mono" style={meta}>{a.albumCount ?? ''}</span>
                </div>
              ))}
            </Group>
          )}
        </div>
      )}
    </Screen>
  )
}

function SongRow({ song }: { song: import('../api/types.js').SubsonicSong }) {
  const client = useClient()
  const playAlbum = usePlayer((s) => s.playAlbum)
  return (
    <button
      onClick={async () => {
        if (!song.albumId) return
        const full = await client.getAlbum(song.albumId)
        const i = full.song.findIndex((s) => s.id === song.id)
        playAlbum(full.song, Math.max(0, i))
      }}
      style={{ ...rowLink, width: '100%', textAlign: 'left' }}
    >
      <img src={client.coverArtUrl(song.coverArt ?? song.id, 72)} alt="" style={thumb} />
      <span style={main}>{song.title}</span>
      <span style={sub}>{song.artist}</span>
      <span className="mono" style={meta}>{duration(song.duration)}</span>
    </button>
  )
}

function Group(
  { label, count, children }: { label: string; count: number; children: React.ReactNode },
) {
  return (
    <section>
      <div className="eyebrow" style={{
        paddingBottom: 8, borderBottom: '1px solid var(--nyx-line-soft)',
      }}>{label} · {count}</div>
      <div>{children}</div>
    </section>
  )
}

function Recent({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div style={{ marginTop: 'var(--nyx-s-6)' }}>
      <div className="eyebrow">Recent searches</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {RECENT.map((r) => (
          <button key={r} onClick={() => onPick(r)} className="mono" style={{
            fontSize: px(10.5), textTransform: 'uppercase', letterSpacing: 'var(--nyx-ls-mono)',
            border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-pill)',
            padding: '7px 13px', minHeight: 32, color: 'var(--nyx-txt-2)',
          }}>{r}</button>
        ))}
      </div>
    </div>
  )
}

function NoResults({ albums }: { albums: number }) {
  return (
    <div style={{ marginTop: 'var(--nyx-s-7)', maxWidth: 520 }}>
      <p className="display" style={{ margin: 0, fontSize: px(24), fontWeight: 300 }}>
        Nothing in the library matches that.
      </p>
      <div className="mono" style={{
        marginTop: 'var(--nyx-s-4)', fontSize: 'var(--nyx-t-mono-sm)',
        color: 'var(--nyx-txt-3)', lineHeight: 1.9,
      }}>
        <div>{albums} albums searched · titles, artists, tracks</div>
        <div style={{ color: 'var(--nyx-txt-2)', marginTop: 10 }}>
          This library is finite. That&rsquo;s the point.
        </div>
      </div>
    </div>
  )
}

function AskMode() {
  return (
    <div style={{
      marginTop: 'var(--nyx-s-6)', border: '1px dashed var(--nyx-line)',
      borderRadius: 'var(--nyx-r-3)', opacity: 0.72, padding: 'var(--nyx-s-6)', maxWidth: '66ch',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span className="mono" style={{
          fontSize: px(9), letterSpacing: '0.16em', textTransform: 'uppercase',
          border: '1px dashed var(--nyx-line)', borderRadius: 'var(--nyx-r-pill)',
          padding: '3px 9px', color: 'var(--nyx-txt-3)',
        }}>Planned</span>
        <span className="mono" style={{
          fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
        }}>natural-language search · v1.2</span>
      </div>
      <p style={{
        margin: 0, color: 'var(--nyx-txt-2)', fontSize: 'var(--nyx-t-body-md)', lineHeight: 1.7,
      }}>
        &ldquo;Something quiet for the evening.&rdquo; &ldquo;Like Talk Talk, but earlier.&rdquo;
        Embeddings precomputed on your laptop, vectors stored beside the library,
        queried on the Pi. No GPU, no cloud, no subscription.
      </p>
      <div className="mono" style={{
        marginTop: 16, fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
      }}>reading sleeves, tracks, and months of history…</div>
    </div>
  )
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="mono" style={{
    marginTop: 'var(--nyx-s-6)', fontSize: 'var(--nyx-t-mono-sm)', color: 'var(--nyx-txt-3)',
  }}>{children}</p>
)

const rowLink: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '36px 1fr 200px 60px', gap: 12,
  alignItems: 'center', padding: '8px 0',
  borderBottom: '1px solid var(--nyx-line-soft)',
  textDecoration: 'none', color: 'inherit',
}
const thumb: React.CSSProperties = {
  width: 36, height: 36, objectFit: 'cover',
  borderRadius: 'var(--nyx-r-sleeve)', background: 'var(--nyx-bg-2)',
}
const main: React.CSSProperties = {
  fontFamily: 'var(--nyx-font-display)', fontSize: px(14.5),
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const sub: React.CSSProperties = {
  fontSize: px(11.5), color: 'var(--nyx-txt-2)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const meta: React.CSSProperties = {
  fontSize: 'var(--nyx-t-mono-xs)', color: 'var(--nyx-txt-3)', textAlign: 'right',
}
