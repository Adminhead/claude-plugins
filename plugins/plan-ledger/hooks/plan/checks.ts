// plan-ledger: plan-time checks (argv the mod runs itself at `verify`). Pure: no `$`, no `crypto`.
// See decision 4 in docs/plans/goal-ledger.md.
import type { Check } from './types'
import { MAX_ARGV_BYTES, MAX_CHECKS } from './types'

const CHECK_KEYS: ReadonlySet<string> = new Set(['label', 'argv', 'expectExit'])

function utf8Bytes(s: string): number {
  let n = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
  }
  return n
}

const isNonEmpty = (x: unknown): x is string => typeof x === 'string' && x.trim() !== ''

/**
 * Validates the `checks` of an item. The rules match the ones `apply` enforces at `create` and
 * `amend` (a check this accepts, `apply` accepts), with one addition: `expectExit` defaults to 0
 * here. Unknown keys are rejected rather than ignored, because a misspelled `expectExit` would
 * otherwise silently become a check that expects exit 0. Nothing is truncated.
 */
export function validateChecks(raw: unknown): Check[] | { error: string } {
  if (!Array.isArray(raw)) return { error: 'checks must be a list.' }
  if (raw.length > MAX_CHECKS) return { error: `At most ${MAX_CHECKS} checks per item.` }
  const labels = new Set<string>()
  const out: Check[] = []
  for (const c of raw) {
    if (typeof c !== 'object' || c === null || Array.isArray(c)) {
      return { error: 'Each check needs a label and an argv.' }
    }
    const rec = c as Record<string, unknown>
    for (const k of Object.keys(rec)) {
      if (!CHECK_KEYS.has(k)) return { error: `Unknown check field "${k}". A check has label, argv and expectExit.` }
    }
    const { label, argv, expectExit } = rec
    if (!isNonEmpty(label)) return { error: 'Each check needs a label.' }
    if (labels.has(label)) return { error: `Duplicate check label "${label}".` }
    labels.add(label)
    if (!Array.isArray(argv) || argv.length === 0 || !argv.every(isNonEmpty)) {
      return { error: `Check "${label}" needs a non-empty argv of non-empty strings.` }
    }
    if ((argv as string[]).reduce((n, a) => n + utf8Bytes(a), 0) > MAX_ARGV_BYTES) {
      return { error: `Check "${label}" argv is over ${MAX_ARGV_BYTES} bytes.` }
    }
    const exit = expectExit === undefined ? 0 : expectExit
    if (typeof exit !== 'number' || !Number.isInteger(exit)) {
      return { error: `Check "${label}" needs an integer expectExit.` }
    }
    out.push({ label, argv: (argv as string[]).slice(), expectExit: exit })
  }
  return out
}

/**
 * A plain 53-bit string hash (cyrb53). Not a security hash: it detects accidental change, not
 * tampering. Returned as 14 hex digits.
 */
export function hash53(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/** JSON with object keys sorted at every depth, so equal values stringify equally. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const body = Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    return `{${body.join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** Identifies the checks an item had when they were run; order of the checks matters, key order does not. */
export function checksHash(checks: Check[]): string {
  return hash53(stableStringify(checks))
}

/** Single-quotes each argument for display or a shell, escaping embedded single quotes. */
export function shellQuote(argv: string[]): string {
  return argv.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')
}
