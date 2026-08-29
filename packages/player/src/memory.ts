/**
 * Decoded-audio budgeting.
 *
 * Web Audio decodes to 32-bit float, so decoded size is far larger than the
 * FLAC on disk. This is what makes naive `decodeAudioData` collapse on
 * long-form material — and this library is full of 20-plus-minute qawwali.
 *
 * One correction to the figures in docs/tech-stack.md D7: `decodeAudioData`
 * resamples to the AudioContext's sample rate, so decoded size is governed by
 * the CONTEXT rate, not the file's. With a 44.1 kHz context a 5-minute 24/96
 * track decodes to ~106 MB, not the ~230 MB quoted. The 22-minute row is
 * unaffected — it was already computed at 44.1 kHz.
 */

import type { PlaybackPath } from './types.js'

export const BYTES_PER_SAMPLE = 4 // Float32

/** Bytes an AudioBuffer will occupy once decoded at `sampleRate`. */
export function decodedBytes(
  durationSec: number,
  sampleRate: number,
  channels = 2,
): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0
  return Math.ceil(durationSec * sampleRate * channels * BYTES_PER_SAMPLE)
}

export interface PathPolicy {
  /** Never hold more than this in one decoded buffer. */
  maxDecodedBytes: number
  /** Belt and braces: refuse the buffer path beyond this regardless of rate. */
  maxDurationSec: number
}

/** 200 MB and 8 minutes. The byte budget is the real constraint; the duration
 *  cap only catches pathological low-rate files. */
export const DEFAULT_PATH_POLICY: PathPolicy = {
  maxDecodedBytes: 200_000_000, // 200 MB
  maxDurationSec: 8 * 60,
}

/**
 * Choose the playback path for a track.
 *
 * `buffer` gives sample-accurate scheduling and therefore true gapless.
 * `stream` gives constant memory but cannot be gapless until the v1.5
 * streaming decoder lands.
 */
export function selectPath(
  durationSec: number,
  sampleRate: number,
  channels = 2,
  policy: PathPolicy = DEFAULT_PATH_POLICY,
): PlaybackPath {
  // Unknown duration: stream. Guessing wrong the other way risks a half-gig
  // allocation on a 4 GB Pi-served client.
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 'stream'
  if (durationSec > policy.maxDurationSec) return 'stream'
  if (decodedBytes(durationSec, sampleRate, channels) > policy.maxDecodedBytes) {
    return 'stream'
  }
  return 'buffer'
}


/** Human-readable, for the signal-path readout and for debugging. */
export function formatBytes(bytes: number): string {
  // Decimal units, matching how docs/tech-stack.md and the design quote sizes.
  if (bytes < 1000) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1000
  let i = 0
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}
