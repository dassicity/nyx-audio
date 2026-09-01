import { describe, expect, it } from 'vitest'
import {
  joinTime, nextStartTime, positionAt, remainingAt, shouldPrefetch,
} from '../src/scheduler.js'
import type { ScheduleWindow } from '../src/scheduler.js'

const w: ScheduleWindow = { startedAt: 100, duration: 240, offset: 0 }

describe('nextStartTime', () => {
  it('joins exactly at the end of the current track', () => {
    expect(nextStartTime(w)).toBe(340)
  })
  it('accounts for a seek — a track resumed mid-way ends sooner', () => {
    expect(nextStartTime({ ...w, offset: 90 })).toBe(250)
  })
})

describe('positionAt', () => {
  it('tracks the audio clock', () => {
    expect(positionAt(w, 100)).toBe(0)
    expect(positionAt(w, 160)).toBe(60)
  })
  it('includes the seek offset', () => {
    expect(positionAt({ ...w, offset: 30 }, 110)).toBe(40)
  })
  it('clamps at both ends rather than reporting nonsense', () => {
    expect(positionAt(w, 90)).toBe(0)
    expect(positionAt(w, 9999)).toBe(240)
  })
})

describe('remainingAt', () => {
  it('counts down and never goes negative', () => {
    expect(remainingAt(w, 100)).toBe(240)
    expect(remainingAt(w, 340)).toBe(0)
    expect(remainingAt(w, 400)).toBe(0)
  })
})

describe('shouldPrefetch', () => {
  it('holds off early in the track', () => {
    expect(shouldPrefetch(w, 150)).toBe(false)
  })
  it('fires once inside the lead window', () => {
    expect(shouldPrefetch(w, 325)).toBe(true)
    expect(shouldPrefetch(w, 324.9)).toBe(false) // 15.1 s remaining
  })
  it('respects a custom lead', () => {
    expect(shouldPrefetch(w, 310, 30)).toBe(true)
  })
})

describe('joinTime', () => {
  it('returns the seamless boundary when there is still time', () => {
    expect(joinTime(w, 330)).toBe(340)
  })
  it('starts immediately when the boundary has passed', () => {
    // Web Audio silently ignores a start time in the past; a late start is
    // audible but recoverable, silence is not.
    expect(joinTime(w, 350)).toBe(350)
  })
})

// Queue mutation is index arithmetic, and index arithmetic is where
// off-by-one bugs live. These mirror NyxPlayer.reorder's logic exactly.
describe('reorder index arithmetic', () => {
  function reindex(from: number, to: number, index: number): number {
    if (from === index) return to
    if (from < index && to >= index) return index - 1
    if (from > index && to <= index) return index + 1
    return index
  }

  it('follows the playing track when it is the one moved', () => {
    expect(reindex(2, 5, 2)).toBe(5)
    expect(reindex(5, 0, 5)).toBe(0)
  })

  it('shifts down when an earlier item moves past the playing track', () => {
    expect(reindex(0, 4, 2)).toBe(1)
  })

  it('shifts up when a later item moves in front of the playing track', () => {
    expect(reindex(5, 1, 3)).toBe(4)
  })

  it('leaves the index alone when both ends are on the same side', () => {
    expect(reindex(0, 1, 5)).toBe(5)
    expect(reindex(7, 8, 2)).toBe(2)
  })
})
