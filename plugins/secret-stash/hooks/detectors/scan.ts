import type { Match, Source } from '../types.ts'

export type Scannable = {
  type: string
  regex: RegExp
  // Receives the matched value and up to 50 characters of context each side.
  validator?: (value: string, context: string) => boolean
}

// Budget for one detect() call across all its patterns.
const BUDGET_MS = 1500
const MAX_MATCHES = 10_000
const CONTEXT = 50

export class ScanOverrun extends Error {}

export function deadlineFromNow(): number {
  return Date.now() + BUDGET_MS
}

// Runs each pattern over `text`. Group 1 is the secret when the pattern captures, else the whole
// match. Whitelisted values (exact match) are skipped. An exec that runs past `deadline` or a
// pattern with too many matches throws: a silent skip would leave secrets in the clear.
//
// Residual risk: the time check happens between execs, so one catastrophic exec still holds the
// thread until it returns. The config guard (custom.ts) is the defense against that.
export function scanPatterns(
  text: string,
  patterns: readonly Scannable[],
  source: Source,
  whitelist: ReadonlySet<string>,
  deadline: number,
): Match[] {
  const out: Match[] = []
  for (const p of patterns) {
    const re = new RegExp(p.regex.source, p.regex.flags.includes('g') ? p.regex.flags : p.regex.flags + 'g')
    let count = 0
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      if (Date.now() > deadline) throw new ScanOverrun(`secret-stash: pattern ${p.type} overran its time budget`)
      if (m[0] === '') {
        re.lastIndex++
        continue
      }
      const value = m[1] ?? m[0]
      const start = m.index + (m[1] === undefined ? 0 : m[0].indexOf(value))
      const end = start + value.length
      if (whitelist.has(value)) continue
      if (p.validator && !p.validator(value, text.slice(Math.max(0, start - CONTEXT), end + CONTEXT))) continue
      // Counted after the filters, so whitelisted or rejected matches (a long base64 blob) don't hit the cap.
      if (++count > MAX_MATCHES) throw new ScanOverrun(`secret-stash: pattern ${p.type} accepted over ${MAX_MATCHES} matches`)
      out.push({ start, end, category: p.type, source })
    }
    if (Date.now() > deadline) throw new ScanOverrun(`secret-stash: pattern ${p.type} overran its time budget`)
  }
  return out
}
