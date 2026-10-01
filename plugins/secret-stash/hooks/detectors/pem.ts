import type { Detector, Match } from '../types.ts'

const BEGIN = /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----/g
const END = /-----END [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----/y
const END_MARK = '-----END '
// A match never spans more than this, so no single stretch of text is a runaway lazy scan.
const CHUNK = 16_384

// The end of the END line that closes a key whose body starts at `from`, scanning only up to
// `limit`; undefined when there is none in range.
function findEnd(text: string, from: number, limit: number): number | undefined {
  for (let i = text.indexOf(END_MARK, from); i >= 0 && i < limit; i = text.indexOf(END_MARK, i + 1)) {
    END.lastIndex = i
    if (END.test(text)) return END.lastIndex
  }
  return undefined
}

// Private key blocks of any kind (RSA, EC, PKCS#8, encrypted, OpenSSH): BEGIN line to END line.
// A block with no END (a truncated Read) runs to the end of the text, so it is covered in
// CHUNK-sized matches rather than left in the clear. A block longer than CHUNK is covered the
// same way, and the END marker is looked for just before each chunk boundary too.
export function pemDetector(): Detector {
  return {
    source: 'custom',
    detect(text) {
      const out: Match[] = []
      for (const m of text.matchAll(BEGIN)) {
        let start = m.index
        if (out.length && start < out[out.length - 1].end) continue
        let searchFrom = start + m[0].length
        for (;;) {
          const end = findEnd(text, searchFrom, start + CHUNK + END_MARK.length)
          const cut = Math.min(end ?? start + CHUNK, text.length)
          if (cut > start) out.push({ start, end: cut, category: 'PRIVATE_KEY', source: 'custom' })
          if (end !== undefined || cut >= text.length) break
          searchFrom = Math.max(cut - 100, searchFrom)
          start = cut
        }
      }
      return out
    },
  }
}
