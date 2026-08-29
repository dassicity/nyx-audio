/**
 * Gapless scheduling.
 *
 * The whole point of the buffer path: instead of starting track N+1 when
 * track N fires an 'ended' event — which is late, and audibly so — we schedule
 * it on the audio clock at an exact offset. Sample-accurate, no seam.
 *
 * These are pure functions over the audio clock so they can be tested without
 * a browser. The scheduling bugs that eat weekends live here, not in the
 * Web Audio calls.
 */

export interface ScheduleWindow {
  /** AudioContext time at which the current track started. */
  startedAt: number
  /** Decoded duration of the current track, in seconds. */
  duration: number
  /** Offset into the track at which playback began (after a seek). */
  offset: number
}

/** AudioContext time at which the next track must begin for a seamless join. */
export function nextStartTime(w: ScheduleWindow): number {
  return w.startedAt + (w.duration - w.offset)
}

/** Elapsed position within the current track at context time `now`. */
export function positionAt(w: ScheduleWindow, now: number): number {
  const p = w.offset + (now - w.startedAt)
  if (p < 0) return 0
  return p > w.duration ? w.duration : p
}

/** Seconds of the current track still to play at `now`. */
export function remainingAt(w: ScheduleWindow, now: number): number {
  return Math.max(0, w.duration - positionAt(w, now))
}

/**
 * Whether it is time to fetch and decode track N+1.
 *
 * `leadSeconds` must comfortably exceed worst-case fetch + decode over the
 * LAN. 15 s is generous for a Pi on Ethernet; the cost of being early is a
 * decoded buffer held slightly longer, which the memory policy already bounds.
 */
export function shouldPrefetch(
  w: ScheduleWindow,
  now: number,
  leadSeconds = 15,
): boolean {
  return remainingAt(w, now) <= leadSeconds
}

/**
 * Whether the next source can still be scheduled seamlessly, or whether we
 * have missed the join and must start it immediately.
 *
 * Returns the context time to pass to `start()`. When the boundary has already
 * passed, returns `now` — a late start is audible but recoverable; a start
 * time in the past is silently ignored by Web Audio, which is worse.
 */
export function joinTime(w: ScheduleWindow, now: number): number {
  const t = nextStartTime(w)
  return t <= now ? now : t
}
