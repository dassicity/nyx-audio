import { useCallback, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ApiUnavailable, createBatch, getBatch, listBatches, startBatch, uploadFile,
} from '../api/nyx.js'
import type { BatchStatus, ImportBatch } from '../api/nyx.js'
import { useClient } from '../api/context.js'
import { Screen, ScreenHeader, Placeholder } from '../components/Screen.js'
import { px } from '../format.js'

const AUDIO = /\.(flac|mp3|m4a|ogg|opus|wav|aiff?|ape|wv|alac)$/i
const SIDECAR = /\.(jpe?g|png|cue|log|txt|m3u)$/i

interface Queued {
  file: File
  progress: number
  error?: string
}

export function Import() {
  const client = useClient()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [queue, setQueue] = useState<Queued[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const history = useQuery({
    queryKey: ['import', 'batches'],
    queryFn: listBatches,
    retry: false,
  })

  // Poll only while something is actually in flight.
  const active = useQuery({
    queryKey: ['import', 'batch', activeId],
    queryFn: () => getBatch(activeId!),
    enabled: Boolean(activeId),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'queued' || s === 'running' ? 1500 : false
    },
  })

  const add = useCallback((files: FileList | File[]) => {
    const accepted = [...files].filter((f) => AUDIO.test(f.name) || SIDECAR.test(f.name))
    setQueue((q) => {
      const seen = new Set(q.map((x) => x.file.name + x.file.size))
      return [
        ...q,
        ...accepted
          .filter((f) => !seen.has(f.name + f.size))
          .map((file) => ({ file, progress: 0 })),
      ]
    })
  }, [])

  async function send() {
    if (queue.length === 0) return
    setBusy(true)
    try {
      const { id } = await createBatch()

      // Sequential, not parallel. A Pi on a microSD writing several hundred
      // megabytes at once is slower than doing them in turn, and progress
      // per file is more useful than a single aggregate bar.
      for (let i = 0; i < queue.length; i++) {
        try {
          await uploadFile(id, queue[i]!.file, (fraction) => {
            setQueue((q) => q.map((item, j) =>
              j === i ? { ...item, progress: fraction } : item))
          })
        } catch (err) {
          setQueue((q) => q.map((item, j) =>
            j === i ? { ...item, error: (err as Error).message } : item))
        }
      }

      await startBatch(id)
      setActiveId(id)
      setQueue([])
      void queryClient.invalidateQueries({ queryKey: ['import', 'batches'] })
    } catch (err) {
      if (err instanceof ApiUnavailable) {
        setQueue((q) => q.map((item) => ({ ...item, error: 'nyx-api is not reachable' })))
      }
    } finally {
      setBusy(false)
    }
  }

  /** Ask Navidrome to rescan, using the browser's own credentials — nyx-api
   *  deliberately holds none. */
  async function rescan() {
    await fetch(client.url('startScan.view'))
    void queryClient.invalidateQueries({ queryKey: ['albums'] })
    void queryClient.invalidateQueries({ queryKey: ['artists'] })
  }

  const done = active.data?.status === 'imported' || active.data?.status === 'partial'
  const totalBytes = queue.reduce((n, q) => n + q.file.size, 0)

  if (history.error instanceof ApiUnavailable) {
    return (
      <Placeholder
        title="Importing needs nyx-api."
        tone="warning"
        lines={[
          'Uploads are received, tagged and filed by nyx-api.',
          '',
          'Deploy it and this page starts working.',
        ]}
      />
    )
  }

  return (
    <Screen>
      <ScreenHeader
        title="Import"
        sub="uploaded · tagged against musicbrainz · filed into the library"
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          add(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${dragging ? 'var(--nyx-signal)' : 'var(--nyx-line)'}`,
          borderRadius: 'var(--nyx-r-3)',
          background: dragging ? 'var(--nyx-bg-2)' : 'transparent',
          padding: 'var(--nyx-s-8)', textAlign: 'center', cursor: 'pointer',
          transition: 'border-color var(--nyx-dur-fast), background var(--nyx-dur-fast)',
        }}
      >
        <div className="display" style={{ fontSize: px(22), fontWeight: 300 }}>
          Drop an album here
        </div>
        <div className="mono" style={{
          fontSize: px(10.5), color: 'var(--nyx-txt-3)', marginTop: 10, lineHeight: 1.8,
        }}>
          <div>flac · mp3 · m4a · ogg · opus · wav · cover art</div>
          <div>a whole folder works — drag the folder itself</div>
        </div>
        <input
          ref={inputRef} type="file" multiple hidden
          // Chrome and Safari understand this; Firefox falls back to files.
          {...{ webkitdirectory: '' } as Record<string, string>}
          onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }}
        />
      </div>

      {queue.length > 0 && (
        <section style={{ marginTop: 'var(--nyx-s-6)' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            borderBottom: '1px solid var(--nyx-line)', paddingBottom: 8, marginBottom: 4,
          }}>
            <span className="eyebrow">Ready to send</span>
            <span className="mono" style={{
              fontSize: px(10.5), color: 'var(--nyx-txt-3)',
            }}>{queue.length} files · {bytes(totalBytes)}</span>
          </div>

          {queue.map((item, i) => (
            <div key={item.file.name + i} style={{
              display: 'grid', gridTemplateColumns: '1fr 120px 70px', gap: 12,
              alignItems: 'center', padding: '8px 0',
              borderBottom: '1px solid var(--nyx-line-soft)',
            }}>
              <span style={{
                fontSize: px(13), overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: item.error ? 'var(--nyx-negative)' : 'var(--nyx-txt-1)',
              }}>{item.file.name}</span>

              <div>
                {item.error ? (
                  <span className="mono" style={{
                    fontSize: px(9.5), color: 'var(--nyx-negative)',
                  }}>{item.error}</span>
                ) : (
                  <div style={{ height: 3, background: 'var(--nyx-bg-3)', borderRadius: 999 }}>
                    <div style={{
                      width: `${item.progress * 100}%`, height: '100%',
                      background: 'var(--nyx-art-bar)', borderRadius: 999,
                      transition: 'width 120ms linear',
                    }} />
                  </div>
                )}
              </div>

              <span className="mono" style={{
                fontSize: px(10), color: 'var(--nyx-txt-3)', textAlign: 'right',
              }}>{bytes(item.file.size)}</span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, marginTop: 'var(--nyx-s-5)' }}>
            <button onClick={() => void send()} disabled={busy} style={{
              minHeight: 'var(--nyx-hit-min)', padding: '0 22px', fontWeight: 700,
              background: 'var(--nyx-txt-1)', color: 'var(--nyx-bg-0)',
              borderRadius: 'var(--nyx-r-2)', opacity: busy ? 0.5 : 1,
            }}>{busy ? 'Sending…' : `Send ${queue.length} files`}</button>
            <button onClick={() => setQueue([])} disabled={busy} style={ghost}>Clear</button>
          </div>
        </section>
      )}

      {active.data && (
        <section style={{ marginTop: 'var(--nyx-s-7)' }}>
          <div className="eyebrow" style={{
            borderBottom: '1px solid var(--nyx-line)', paddingBottom: 8, marginBottom: 14,
          }}>This import</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatusDot status={active.data.status} />
            <div>
              <div style={{ fontSize: px(14) }}>{describe(active.data.status)}</div>
              {active.data.message && (
                <div className="mono" style={{
                  fontSize: px(10.5), color: 'var(--nyx-txt-3)', marginTop: 4,
                }}>{active.data.message}</div>
              )}
            </div>
          </div>

          {active.data.status === 'partial' && (
            <div style={{
              marginTop: 'var(--nyx-s-5)', border: '1px solid var(--nyx-line)',
              borderRadius: 'var(--nyx-r-2)', padding: 'var(--nyx-s-5)',
            }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Held for review</div>
              <p className="mono" style={{
                margin: 0, fontSize: px(10.5), color: 'var(--nyx-txt-3)', lineHeight: 1.8,
              }}>
                MusicBrainz had no confident match for these, so they were not
                filed. Guessing is how wrong metadata gets into a library.
                They are on the Pi under <code>/srv/nyx/import/quarantine</code>,
                and importing them by hand with beets is the reliable fix.
              </p>
              {active.data.files?.filter((f) => f.status === 'quarantined').map((f) => (
                <div key={f.name} className="mono" style={{
                  fontSize: px(10), color: 'var(--nyx-txt-2)', marginTop: 6,
                }}>{f.name}</div>
              ))}
            </div>
          )}

          {done && (
            <button onClick={() => void rescan()} style={{
              ...ghost, marginTop: 'var(--nyx-s-5)',
            }}>Rescan the library</button>
          )}
        </section>
      )}

      {(history.data?.length ?? 0) > 0 && (
        <section style={{ marginTop: 'var(--nyx-s-7)' }}>
          <div className="eyebrow" style={{
            borderBottom: '1px solid var(--nyx-line)', paddingBottom: 8, marginBottom: 4,
          }}>Recent imports</div>
          {history.data!.map((b) => (
            <div key={b.id} style={{
              display: 'grid', gridTemplateColumns: '14px 1fr auto auto', gap: 12,
              alignItems: 'center', padding: '9px 0',
              borderBottom: '1px solid var(--nyx-line-soft)',
            }}>
              <StatusDot status={b.status} />
              <span className="mono" style={{
                fontSize: px(10.5), color: 'var(--nyx-txt-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{b.message ?? describe(b.status)}</span>
              <span className="mono" style={meta}>{b.file_count ?? 0} files</span>
              <span className="mono" style={meta}>{when(b.created_at)}</span>
            </div>
          ))}
        </section>
      )}
    </Screen>
  )
}

function StatusDot({ status }: { status: BatchStatus }) {
  const colour =
    status === 'imported' ? 'var(--nyx-positive)'
    : status === 'partial' ? 'var(--nyx-warning)'
    : status === 'failed' ? 'var(--nyx-negative)'
    : 'var(--nyx-txt-3)'
  const pulsing = status === 'queued' || status === 'running'
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%', background: colour, flex: 'none',
      animation: pulsing ? 'nyx-pulse 1.4s ease-in-out infinite' : undefined,
    }} />
  )
}

function describe(status: BatchStatus): string {
  switch (status) {
    case 'staging': return 'Waiting for files'
    case 'queued': return 'Queued'
    case 'running': return 'Tagging and filing — fingerprinting takes a while on a Pi'
    case 'imported': return 'Imported'
    case 'partial': return 'Imported, with some held back'
    case 'failed': return 'Import failed'
  }
}

function bytes(n: number): string {
  if (n < 1000) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1000
  let i = 0
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++ }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

function when(iso: string): string {
  const d = new Date(iso)
  const mins = (Date.now() - d.getTime()) / 60000
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.round(mins)}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const ghost: React.CSSProperties = {
  minHeight: 'var(--nyx-hit-min)', padding: '0 18px',
  border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
  color: 'var(--nyx-txt-2)',
}
const meta: React.CSSProperties = {
  fontSize: px(10), color: 'var(--nyx-txt-3)', textAlign: 'right',
}
