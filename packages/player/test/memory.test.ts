import { describe, expect, it } from 'vitest'
import {
  decodedBytes,
  formatBytes,
  selectPath,
  DEFAULT_PATH_POLICY,
} from '../src/memory.js'

const MB = 1_000_000 // decimal, as D7 quotes them

describe('decodedBytes', () => {
  it('matches the figures in docs/tech-stack.md D7', () => {
    // 5-minute 16/44.1 → ~106 MB (the doc's headline number)
    expect(decodedBytes(300, 44100) / MB).toBeCloseTo(105.8, 1)
    // 22-minute movement at 44.1 kHz → ~466 MB
    expect(decodedBytes(22 * 60, 44100) / MB).toBeCloseTo(465.7, 1)
  })

  it('is governed by the context rate, not the file rate', () => {
    // The correction to D7: decodeAudioData resamples to the context rate,
    // so a 24/96 file in a 44.1 kHz context costs the same as a 16/44.1 one.
    expect(decodedBytes(300, 44100)).toBe(decodedBytes(300, 44100))
    expect(decodedBytes(300, 96000)).toBeGreaterThan(decodedBytes(300, 44100))
  })

  it('returns 0 for nonsense durations', () => {
    expect(decodedBytes(0, 44100)).toBe(0)
    expect(decodedBytes(-5, 44100)).toBe(0)
    expect(decodedBytes(Number.NaN, 44100)).toBe(0)
  })
})

describe('selectPath', () => {
  it('sends ordinary songs down the buffer path so they can be gapless', () => {
    expect(selectPath(4 * 60, 44100)).toBe('buffer')
    expect(selectPath(7 * 60, 44100)).toBe('buffer')
  })

  it('streams long-form material rather than allocating half a gigabyte', () => {
    // A 22-minute qawwali — the shape of most of this library.
    expect(selectPath(22 * 60, 44100)).toBe('stream')
    // A 26-minute classical movement.
    expect(selectPath(26 * 60, 44100)).toBe('stream')
  })

  it('streams when the duration is unknown', () => {
    expect(selectPath(0, 44100)).toBe('stream')
    expect(selectPath(Number.NaN, 44100)).toBe('stream')
  })

  it('enforces the byte budget even under the duration cap', () => {
    // 7 minutes is under the 8-minute cap, but at 192 kHz it blows the budget.
    expect(selectPath(7 * 60, 192000)).toBe('stream')
  })

  it('honours the duration cap even when the byte budget would allow it', () => {
    const roomy = { ...DEFAULT_PATH_POLICY, maxDecodedBytes: 4_000 * MB }
    expect(selectPath(20 * 60, 44100, 2, roomy)).toBe('stream')
  })
})

describe('formatBytes', () => {
  it('reads the way a signal-path readout should', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(decodedBytes(300, 44100))).toBe('106 MB')
  })
})
