/**
 * The Nyx playback engine.
 *
 * Headless by design (docs/tech-stack.md D8): it knows nothing about React,
 * nothing about Subsonic, and nothing about how anything looks. Everything it
 * needs from the outside arrives through `PlayerDeps`, which is also what
 * makes it testable without a browser.
 *
 * Two paths, chosen per track by `selectPath`:
 *   buffer — decoded up front, scheduled on the audio clock. True gapless.
 *   stream — an <audio> element. Constant memory, but a seam at the join
 *            until the v1.5 streaming decoder lands.
 */
import { computeGain } from './replaygain.js'
import { selectPath } from './memory.js'
import { joinTime, shouldPrefetch, positionAt } from './scheduler.js'
import type { ScheduleWindow } from './scheduler.js'
import { DEFAULT_GAIN } from './types.js'
import type { GainSettings, PlaybackPath, Track } from './types.js'
import type { GainResult } from './replaygain.js'

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface PlayerState {
  queue: Track[]
  index: number
  status: PlayerStatus
  /** Seconds into the current track. */
  position: number
  duration: number
  path: PlaybackPath | null
  gain: GainResult | null
  /** What the browser is actually running at — for the signal-path readout. */
  outputSampleRate: number
  error: string | null
}

export interface PlayerDeps {
  createContext: () => AudioContext
  /** Full bytes, for the buffer path. */
  fetchAudio: (track: Track, signal: AbortSignal) => Promise<ArrayBuffer>
  /** A URL the browser can stream, for the stream path. */
  streamUrl: (track: Track) => string
  createAudioElement: () => HTMLAudioElement
  mediaSession?: MediaSession | null
  /** Wall clock, injectable for tests. */
  now?: () => number
}

const INITIAL: PlayerState = {
  queue: [], index: -1, status: 'idle', position: 0, duration: 0,
  path: null, gain: null, outputSampleRate: 0, error: null,
}

export class NyxPlayer {
  #deps: PlayerDeps
  #ctx: AudioContext | null = null
  #gainNode: GainNode | null = null
  #state: PlayerState = INITIAL
  #listeners = new Set<(s: PlayerState) => void>()
  #settings: GainSettings = DEFAULT_GAIN

  // buffer path
  #source: AudioBufferSourceNode | null = null
  #window: ScheduleWindow | null = null
  #nextBuffer: { id: string; buffer: AudioBuffer } | null = null
  #nextSource: AudioBufferSourceNode | null = null

  // stream path
  #el: HTMLAudioElement | null = null
  #analyser: AnalyserNode | null = null

  #abort: AbortController | null = null
  #ticker: ReturnType<typeof setInterval> | null = null

  constructor(deps: PlayerDeps) {
    this.#deps = deps
  }

  get state(): PlayerState { return this.#state }

  subscribe(fn: (s: PlayerState) => void): () => void {
    this.#listeners.add(fn)
    fn(this.#state)
    return () => { this.#listeners.delete(fn) }
  }

  /**
   * A real analyser over the output, for visualisation.
   *
   * Created on demand: an FFT node costs nothing when nobody is reading it,
   * but there is no reason to build one for a session that never opens the
   * ambient display. Returns null before playback has started.
   */
  analyser(): AnalyserNode | null {
    if (this.#analyser) return this.#analyser
    const ctx = this.#ctx
    if (!ctx || !this.#gainNode) return null

    const node = ctx.createAnalyser()
    node.fftSize = 1024
    // Slower than the default, so bars settle rather than jitter.
    node.smoothingTimeConstant = 0.82
    this.#gainNode.connect(node)
    this.#analyser = node
    return node
  }

  setGainSettings(s: Partial<GainSettings>): void {
    this.#settings = { ...this.#settings, ...s }
    const track = this.#current
    if (track && this.#gainNode && this.#ctx) {
      const g = computeGain(track, this.#settings)
      this.#gainNode.gain.setTargetAtTime(g.linear, this.#ctx.currentTime, 0.01)
      this.#patch({ gain: g })
    }
  }

  /** Replace the queue and begin at `startIndex`. */
  async load(queue: Track[], startIndex = 0): Promise<void> {
    this.#patch({ queue, index: startIndex })
    await this.#start(startIndex)
  }

  async play(): Promise<void> {
    const ctx = this.#ensureContext()
    await ctx.resume()
    if (this.#state.path === 'stream') await this.#el?.play()
    this.#patch({ status: 'playing' })
    this.#setSessionState('playing')
  }

  pause(): void {
    if (this.#state.path === 'stream') this.#el?.pause()
    else void this.#ctx?.suspend()
    this.#patch({ status: 'paused' })
    this.#setSessionState('paused')
  }

  async toggle(): Promise<void> {
    if (this.#state.status === 'playing') this.pause()
    else await this.play()
  }

  async next(): Promise<void> { await this.#start(this.#state.index + 1) }
  async previous(): Promise<void> {
    // Restart the track first, like every other player. Only jump back if
    // we're already near the top.
    if (this.#state.position > 3) return this.seek(0)
    await this.#start(this.#state.index - 1)
  }

  /**
   * Move a queue item. Playback is untouched unless the currently-playing
   * item moves, in which case only the index is corrected — the audio source
   * keeps running, which is the whole point.
   */
  reorder(from: number, to: number): void {
    const queue = [...this.#state.queue]
    if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) return
    const [moved] = queue.splice(from, 1)
    if (!moved) return
    queue.splice(to, 0, moved)

    let index = this.#state.index
    if (from === index) index = to
    else if (from < index && to >= index) index--
    else if (from > index && to <= index) index++

    this.#patch({ queue, index })
    // A scheduled successor may no longer be the right track.
    this.#discardScheduled()
  }

  /** Remove an item. Removing what is playing advances to the next track. */
  remove(at: number): void {
    const queue = [...this.#state.queue]
    if (at < 0 || at >= queue.length) return
    queue.splice(at, 1)

    if (at === this.#state.index) {
      this.#patch({ queue })
      if (queue.length === 0) { this.#teardownSources(); this.#patch({ index: -1, status: 'idle' }) }
      else void this.#start(Math.min(at, queue.length - 1))
      return
    }

    const index = at < this.#state.index ? this.#state.index - 1 : this.#state.index
    this.#patch({ queue, index })
    this.#discardScheduled()
  }

  clear(): void {
    this.#teardownSources()
    this.#stopTicker()
    this.#patch({ queue: [], index: -1, status: 'idle', position: 0, duration: 0 })
  }

  /** Drop a pre-scheduled successor after the queue changed underneath it. */
  #discardScheduled(): void {
    if (!this.#nextSource) return
    this.#nextSource.onended = null
    try { this.#nextSource.stop() } catch { /* not started */ }
    this.#nextSource.disconnect()
    this.#nextSource = null
    this.#nextBuffer = null
  }

  async seek(seconds: number): Promise<void> {
    const clamped = Math.max(0, Math.min(seconds, this.#state.duration))
    if (this.#state.path === 'stream') {
      if (this.#el) this.#el.currentTime = clamped
      this.#patch({ position: clamped })
      return
    }
    await this.#start(this.#state.index, clamped)
  }

  destroy(): void {
    this.#stopTicker()
    this.#abort?.abort()
    this.#teardownSources()
    this.#el?.remove()
    this.#analyser?.disconnect()
    this.#analyser = null
    void this.#ctx?.close()
    this.#ctx = null
    this.#listeners.clear()
  }

  // ── internals ──────────────────────────────────────────────────────────

  get #current(): Track | undefined { return this.#state.queue[this.#state.index] }

  #ensureContext(): AudioContext {
    if (!this.#ctx) {
      this.#ctx = this.#deps.createContext()
      this.#gainNode = this.#ctx.createGain()
      this.#gainNode.connect(this.#ctx.destination)
      this.#patch({ outputSampleRate: this.#ctx.sampleRate })
    }
    return this.#ctx
  }

  async #start(index: number, offset = 0): Promise<void> {
    const track = this.#state.queue[index]
    if (!track) { this.#patch({ status: 'idle', index: -1 }); return }

    this.#abort?.abort()
    this.#abort = new AbortController()
    this.#teardownSources()

    const ctx = this.#ensureContext()
    const path = selectPath(track.duration, ctx.sampleRate)
    const gain = computeGain(track, this.#settings)
    this.#gainNode!.gain.value = gain.linear

    this.#patch({
      index, path, gain, position: offset, status: 'loading',
      duration: track.duration, error: null,
    })

    try {
      if (path === 'buffer') await this.#startBuffer(track, offset, ctx)
      else await this.#startStream(track, offset)
      this.#patch({ status: 'playing' })
      this.#updateSessionMetadata(track)
      this.#startTicker()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      this.#patch({ status: 'error', error: (err as Error).message })
    }
  }

  async #startBuffer(track: Track, offset: number, ctx: AudioContext): Promise<void> {
    const reuse = this.#nextBuffer?.id === track.id ? this.#nextBuffer.buffer : null
    this.#nextBuffer = null

    const buffer = reuse ?? await ctx.decodeAudioData(
      await this.#deps.fetchAudio(track, this.#abort!.signal))

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.#gainNode!)
    const at = ctx.currentTime
    src.start(at, offset)
    this.#source = src
    // Decoded duration is authoritative; the tag is only advisory.
    this.#window = { startedAt: at, duration: buffer.duration, offset }
    this.#patch({ duration: buffer.duration })

    src.onended = () => {
      // A scheduled successor has already taken over; don't double-advance.
      if (this.#nextSource) return
      void this.next()
    }
  }

  async #startStream(track: Track, offset: number): Promise<void> {
    const el = this.#deps.createAudioElement()
    el.src = this.#deps.streamUrl(track)
    el.currentTime = offset
    el.crossOrigin = 'anonymous'
    const ctx = this.#ensureContext()
    ctx.createMediaElementSource(el).connect(this.#gainNode!)
    el.onended = () => { void this.next() }
    this.#el = el
    this.#window = null
    await el.play()
  }

  /**
   * Decode track N+1 and schedule it to begin exactly when N ends. This is the
   * whole reason the buffer path exists — waiting for an 'ended' event is late,
   * and on an album that was sequenced to run continuously you hear it.
   */
  async #prefetch(): Promise<void> {
    const upcoming = this.#state.queue[this.#state.index + 1]
    const ctx = this.#ctx
    if (!upcoming || !ctx || !this.#window || this.#nextBuffer || this.#nextSource) return
    if (selectPath(upcoming.duration, ctx.sampleRate) !== 'buffer') return

    try {
      const bytes = await this.#deps.fetchAudio(upcoming, this.#abort!.signal)
      const buffer = await ctx.decodeAudioData(bytes)
      this.#nextBuffer = { id: upcoming.id, buffer }

      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(this.#gainNode!)
      src.start(joinTime(this.#window, ctx.currentTime))
      this.#nextSource = src
    } catch { /* fall back to the ended-event path */ }
  }

  #startTicker(): void {
    this.#stopTicker()
    this.#ticker = setInterval(() => {
      const ctx = this.#ctx
      if (this.#state.status !== 'playing') return

      if (this.#state.path === 'stream' && this.#el) {
        this.#patch({ position: this.#el.currentTime })
        return
      }
      if (!ctx || !this.#window) return

      this.#patch({ position: positionAt(this.#window, ctx.currentTime) })
      if (shouldPrefetch(this.#window, ctx.currentTime)) void this.#prefetch()

      // The scheduled successor has begun — promote it.
      if (this.#nextSource && ctx.currentTime >= joinTime(this.#window, 0)) {
        this.#promoteScheduled()
      }
    }, 250)
  }

  #promoteScheduled(): void {
    const ctx = this.#ctx!
    const buffer = this.#nextBuffer?.buffer
    this.#source?.disconnect()
    this.#source = this.#nextSource
    this.#nextSource = null
    this.#nextBuffer = null
    if (!buffer) return

    const index = this.#state.index + 1
    this.#window = { startedAt: ctx.currentTime, duration: buffer.duration, offset: 0 }
    const track = this.#state.queue[index]
    this.#patch({ index, duration: buffer.duration, position: 0 })
    if (track) {
      const gain = computeGain(track, this.#settings)
      this.#gainNode!.gain.setTargetAtTime(gain.linear, ctx.currentTime, 0.01)
      this.#patch({ gain })
      this.#updateSessionMetadata(track)
    }
    if (this.#source) this.#source.onended = () => { if (!this.#nextSource) void this.next() }
  }

  #stopTicker(): void {
    if (this.#ticker) { clearInterval(this.#ticker); this.#ticker = null }
  }

  #teardownSources(): void {
    for (const s of [this.#source, this.#nextSource]) {
      if (!s) continue
      s.onended = null
      try { s.stop() } catch { /* already stopped */ }
      s.disconnect()
    }
    this.#source = null
    this.#nextSource = null
    this.#nextBuffer = null
    this.#window = null
    if (this.#el) { this.#el.pause(); this.#el.onended = null; this.#el.src = ''; this.#el = null }
  }

  #updateSessionMetadata(track: Track): void {
    const ms = this.#deps.mediaSession
    if (!ms) return
    ms.metadata = new MediaMetadata({
      title: track.title, artist: track.artist, album: track.album,
    })
    ms.setActionHandler('play', () => { void this.play() })
    ms.setActionHandler('pause', () => { this.pause() })
    ms.setActionHandler('previoustrack', () => { void this.previous() })
    ms.setActionHandler('nexttrack', () => { void this.next() })
    ms.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) void this.seek(d.seekTime)
    })
  }

  #setSessionState(s: 'playing' | 'paused'): void {
    const ms = this.#deps.mediaSession
    if (ms) ms.playbackState = s
  }

  #patch(p: Partial<PlayerState>): void {
    this.#state = { ...this.#state, ...p }
    for (const fn of this.#listeners) fn(this.#state)
  }
}
