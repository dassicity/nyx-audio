import { describe, expect, it } from 'vitest'
import { md5, makeSalt } from '../src/api/md5.js'

// Every expected value below was produced by an independent implementation
// (the system `md5`), not by this code. A self-consistent test would prove
// nothing — and a broken MD5 fails as "wrong password", which is a miserable
// thing to debug.
describe('md5', () => {
  it('matches the RFC 1321 vectors', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0')
    expect(md5('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b')
    expect(md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890'))
      .toBe('57edf4a22be3c955ac49da2e2107b67a')
  })

  it('pads correctly at the block boundaries', () => {
    // 55/56/64 are where the 64-bit length field spills into another block.
    expect(md5('a'.repeat(55))).toBe('ef1772b6dff9a122358552954ad0df65')
    expect(md5('a'.repeat(56))).toBe('3b0c8ac703f828b04c6c197006d17218')
    expect(md5('a'.repeat(64))).toBe('014842d480b571495a4a0363793f7367')
  })

  it('handles input spanning several blocks', () => {
    expect(md5('a'.repeat(120))).toBe('5f61c0ccad4cac44c75ff505e1f1e537')
  })

  it('hashes UTF-8 bytes, not UTF-16 code units', () => {
    // A password with an accent must hash the same here as on the server.
    expect(md5('é')).toBe('66ddcd97cfdeabb2f6fb8a999b4bc76f')
    expect(md5('Cesária Évora')).toBe('3df0b49c71e3b09598f4f838fa851617')
    expect(md5('é')).not.toBe(md5('e'))
  })
})

describe('makeSalt', () => {
  it('is hex of the requested length', () => {
    expect(makeSalt(8)).toMatch(/^[0-9a-f]{16}$/)
    expect(makeSalt(4)).toMatch(/^[0-9a-f]{8}$/)
  })

  it('differs each call — a reused salt defeats the point', () => {
    const salts = new Set(Array.from({ length: 50 }, () => makeSalt()))
    expect(salts.size).toBe(50)
  })
})
