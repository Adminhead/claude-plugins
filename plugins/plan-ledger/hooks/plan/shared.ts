// plan-ledger: small pure helpers shared by apply, checks, authorize and replay. No `$`, no I/O.

export const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

/** A string with something other than whitespace in it. */
export const isNonEmpty = (x: unknown): x is string => typeof x === 'string' && x.trim() !== ''

export function utf8Bytes(s: string): number {
  let n = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
  }
  return n
}

// C0 and C1 controls (newline, tab and escape included) plus the Unicode line and paragraph separators.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/

/** True when `s` holds a control character, which would let a one-line field start a new line in rendered text. */
export const hasControl = (s: string): boolean => CONTROL.test(s)
