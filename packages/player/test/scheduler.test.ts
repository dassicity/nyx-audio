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
