import { describe, expect, it } from 'vitest'
import { activeLineAt, parseLrc } from '../src/api/lyrics.js'

describe('parseLrc', () => {
  it('parses timestamps and text', () => {
    expect(parseLrc('[00:12.50]The harbour lights come on in threes')).toEqual([
      { time: 12.5, text: 'The harbour lights come on in threes' },
    ])
  })

  it('handles 1, 2 and 3 digit fractions correctly', () => {
    // .5 is half a second; .05 and .050 are fifty milliseconds.
    expect(parseLrc('[00:01.5]a')[0]!.time).toBeCloseTo(1.5, 6)
    expect(parseLrc('[00:01.05]a')[0]!.time).toBeCloseTo(1.05, 6)
    expect(parseLrc('[00:01.050]a')[0]!.time).toBeCloseTo(1.05, 6)
  })

  it('accepts a colon before the fraction, which some files use', () => {
    expect(parseLrc('[01:02:30]a')[0]!.time).toBeCloseTo(62.3, 6)
  })

  it('expands a line carrying several timestamps', () => {
    // A repeating chorus is written once and stamped many times.
    const lines = parseLrc('[00:10.00][01:20.00][02:30.00]chorus')
    expect(lines.map((l) => l.time)).toEqual([10, 80, 150])
    expect(lines.every((l) => l.text === 'chorus')).toBe(true)
  })

  it('keeps empty lines — they are meaningful pauses', () => {
    const lines = parseLrc('[00:05.00]sung\n[00:09.00]\n[00:12.00]again')
    expect(lines).toHaveLength(3)
    expect(lines[1]!.text).toBe('')
  })

  it('ignores metadata tags that are not timestamps', () => {
    const lines = parseLrc('[ar:Nusrat Fateh Ali Khan]\n[ti:Allah Hoo]\n[00:03.00]real')
    expect(lines).toEqual([{ time: 3, text: 'real' }])
  })

  it('sorts out-of-order lines', () => {
    const lines = parseLrc('[00:30.00]third\n[00:10.00]first\n[00:20.00]second')
    expect(lines.map((l) => l.text)).toEqual(['first', 'second', 'third'])
  })

  it('handles long tracks past the hour without wrapping', () => {
    // A 26-minute movement is ordinary here; minutes must not roll over.
    expect(parseLrc('[26:04.00]late')[0]!.time).toBeCloseTo(1564, 6)
    expect(parseLrc('[100:00.00]x')[0]!.time).toBeCloseTo(6000, 6)
  })

  it('returns nothing for empty or untimed input', () => {
    expect(parseLrc('')).toEqual([])
    expect(parseLrc('just prose\nwith no stamps')).toEqual([])
  })
})

describe('activeLineAt', () => {
  const lines = [0, 10, 20, 30].map((time) => ({ time, text: `t${time}` }))

  it('returns -1 before the first line', () => {
    expect(activeLineAt([{ time: 5, text: 'a' }], 0)).toBe(-1)
  })
  it('finds the current line', () => {
    expect(activeLineAt(lines, 0)).toBe(0)
    expect(activeLineAt(lines, 15)).toBe(1)
    expect(activeLineAt(lines, 29.99)).toBe(2)
  })
  it('is inclusive at the boundary', () => {
    expect(activeLineAt(lines, 20)).toBe(2)
  })
  it('stays on the last line past the end', () => {
    expect(activeLineAt(lines, 9999)).toBe(3)
  })
  it('handles an empty list', () => {
    expect(activeLineAt([], 5)).toBe(-1)
  })
})
