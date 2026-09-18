import { useState } from 'react'
import { resolveAlbum } from '../api/nyx.js'
import type { AlbumDecision, ResolveOutcome, ResolveRequest } from '../api/nyx.js'
import { px } from '../format.js'

/**
 * Resolving a held album by hand.
 *
 * beets held it because it would not guess. This is a person deciding
 * instead: file it as a release they recognise, keep the tags it came with,
 * or throw it away. Each choice is one beets run on one album folder.
 */
export function ResolveAlbum(
  { batchId, album, onResolved }:
  { batchId: string; album: AlbumDecision; onResolved: (outcome: ResolveOutcome) => void },
) {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ outcome: ResolveOutcome; message: string } | null>(null)
  const [pasted, setPasted] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Remembered so "keep both" can repeat exactly what was just tried.
  const [lastAttempt, setLastAttempt] = useState<ResolveRequest | null>(null)

  const folder = album.folder ?? ''
  const done = album.resolution?.outcome === 'filed' || album.resolution?.outcome === 'discarded'

  async function run(label: string, body: ResolveRequest) {
    setBusy(label)
    setResult(null)
    setLastAttempt(body)
    try {
      const r = await resolveAlbum(batchId, body)
      setResult(r)
      onResolved(r.outcome)
    } catch (err) {
      setResult({ outcome: 'failed', message: (err as Error).message })
    } finally {
      setBusy(null)
      setConfirmDiscard(false)
    }
  }

  if (done) {
    return (
      <div className="mono" style={{ fontSize: px(10.5), color: 'var(--nyx-positive)', marginTop: 10 }}>
        {album.resolution!.outcome === 'filed' ? 'Filed by hand' : 'Discarded'}
        {album.resolution!.message ? ` · ${album.resolution!.message}` : ''}
      </div>
    )
  }

  const disabled = busy !== null

  return (
    <div style={{
      marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--nyx-line-soft)',
      display: 'grid', gap: 12,
    }}>
      {album.candidates.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="eyebrow">Is it one of these?</div>
          {album.candidates.map((c) => (
            <div key={c.id} style={{
              display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 12,
              alignItems: 'center', padding: '6px 0',
            }}>
              <span className="mono" style={{
                fontSize: px(11), textAlign: 'right',
                color: c.similarity >= 80 ? 'var(--nyx-txt-1)' : 'var(--nyx-txt-3)',
              }}>{c.similarity}%</span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: px(12.5), overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{c.name}</div>
                <a
                  href={`https://musicbrainz.org/release/${c.id}`}
                  target="_blank" rel="noreferrer" className="mono"
                  style={{ fontSize: px(9.5), color: 'var(--nyx-txt-3)' }}
                >check on musicbrainz ↗</a>
              </div>
              <button
                disabled={disabled}
                onClick={() => void run(c.id, { folder, action: 'accept', release: c.id })}
                style={primary(disabled)}
              >{busy === c.id ? 'Filing…' : 'File as this'}</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        <div className="eyebrow">Or a release you know</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="paste a musicbrainz.org/release link"
            aria-label="MusicBrainz release link"
            className="mono"
            style={{
              flex: 1, minWidth: 0, minHeight: 36, padding: '0 10px',
              background: 'var(--nyx-bg-1)', color: 'var(--nyx-txt-1)',
              border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
              fontSize: px(11),
            }}
          />
          <button
            disabled={disabled || !pasted.trim()}
            onClick={() => void run('pasted', { folder, action: 'accept', release: pasted })}
            style={primary(disabled || !pasted.trim())}
          >{busy === 'pasted' ? 'Filing…' : 'File as that'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          disabled={disabled}
          onClick={() => void run('asis', { folder, action: 'asis' })}
          style={ghost(disabled)}
          title="File it using the tags the files already have, without MusicBrainz"
        >{busy === 'asis' ? 'Filing…' : 'Keep my tags'}</button>

        {!confirmDiscard ? (
          <button disabled={disabled} onClick={() => setConfirmDiscard(true)} style={ghost(disabled)}>
            Discard
          </button>
        ) : (
          <>
            <span className="mono" style={{ fontSize: px(10.5), color: 'var(--nyx-negative)' }}>
              Delete these files for good?
            </span>
            <button
              disabled={disabled}
              onClick={() => void run('discard', { folder, action: 'discard' })}
              style={{ ...ghost(disabled), borderColor: 'var(--nyx-negative)', color: 'var(--nyx-negative)' }}
            >{busy === 'discard' ? 'Deleting…' : 'Yes, discard'}</button>
            <button onClick={() => setConfirmDiscard(false)} style={ghost(false)}>Cancel</button>
          </>
        )}
      </div>

      {busy && (
        <div className="mono" style={{ fontSize: px(10), color: 'var(--nyx-txt-3)' }}>
          beets is tagging, fetching cover art and scanning loudness — usually under a minute
        </div>
      )}

      {result && <Outcome
        result={result}
        onKeepBoth={lastAttempt ? () => void run('keepboth', { ...lastAttempt, keep_duplicate: true }) : undefined}
        onDiscard={() => void run('discard', { folder, action: 'discard' })}
        busy={busy}
      />}
    </div>
  )
}

function Outcome(
  { result, onKeepBoth, onDiscard, busy }:
  {
    result: { outcome: ResolveOutcome; message: string }
    onKeepBoth: (() => void) | undefined
    onDiscard: () => void
    busy: string | null
  },
) {
  const colour =
    result.outcome === 'filed' || result.outcome === 'discarded' ? 'var(--nyx-positive)'
    : result.outcome === 'duplicate' ? 'var(--nyx-warning)'
    : 'var(--nyx-negative)'

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--nyx-r-2)',
      border: `1px solid ${colour}`, display: 'grid', gap: 8,
    }}>
      <div className="mono" style={{ fontSize: px(11), color: colour }}>{result.message}</div>

      {/* The one outcome that needs another decision: you already have it. */}
      {result.outcome === 'duplicate' && (
        <>
          <div className="mono" style={{ fontSize: px(10), color: 'var(--nyx-txt-3)', lineHeight: 1.7 }}>
            Nothing was changed. If this is a second copy of something you already
            own, discard it. If it is a different edition you want to keep, file both.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy !== null} onClick={onDiscard} style={ghost(busy !== null)}>
              {busy === 'discard' ? 'Deleting…' : 'Discard these'}
            </button>
            {onKeepBoth && (
              <button disabled={busy !== null} onClick={onKeepBoth} style={ghost(busy !== null)}>
                {busy === 'keepboth' ? 'Filing…' : 'Keep both'}
              </button>
            )}
          </div>
        </>
      )}

      {result.outcome === 'held' && (
        <div className="mono" style={{ fontSize: px(10), color: 'var(--nyx-txt-3)' }}>
          The reason is in "What beets said" below.
        </div>
      )}
    </div>
  )
}

const primary = (disabled: boolean): React.CSSProperties => ({
  minHeight: 36, padding: '0 14px', fontWeight: 700, fontSize: px(12),
  background: 'var(--nyx-txt-1)', color: 'var(--nyx-bg-0)',
  borderRadius: 'var(--nyx-r-2)', opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap',
})
const ghost = (disabled: boolean): React.CSSProperties => ({
  minHeight: 36, padding: '0 14px', fontSize: px(12),
  border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
  color: 'var(--nyx-txt-2)', opacity: disabled ? 0.45 : 1,
})
