import { ID_RE, MIN_SECRET_LEN } from './ids.ts'
import type { Detector, Match, Source } from './types.ts'

const PRIORITY: readonly Source[] = ['registered', 'vault', 'env', 'custom', 'openredaction']

export function literalDetector(
  lits: readonly { value: string; category: string }[],
  source: Source = 'vault',
): Detector {
  return {
    source,
    detect(text) {
      const out: Match[] = []
      for (const { value, category } of lits) {
        if (!value) continue
        for (let i = text.indexOf(value); i >= 0; i = text.indexOf(value, i + value.length)) {
          out.push({ start: i, end: i + value.length, category, source })
        }
      }
      return out
    },
  }
}

const rank = (a: Match, b: Match) =>
  (b.end - b.start) - (a.end - a.start) || PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source)

// Picks the spans to redact. Matches shorter than MIN_SECRET_LEN are dropped, overlapping
// ones merge into one span that takes the best match's category (longest, then source
// priority), and existing IDs are cut out of each span. Leftovers of any length stay,
// so no part of a secret is left behind. Sorted by start.
export function resolve(text: string, matches: readonly Match[]): Match[] {
  const ids = [...text.matchAll(ID_RE)].map(m => [m.index, m.index + m[0].length] as const)
  const sorted = matches.filter(m => m.end - m.start >= MIN_SECRET_LEN).sort((a, b) => a.start - b.start)

  const clusters: Match[][] = []
  let end = -1
  for (const m of sorted) {
    if (m.start < end) {
      clusters[clusters.length - 1].push(m)
      end = Math.max(end, m.end)
    } else {
      clusters.push([m])
      end = m.end
    }
  }

  const out: Match[] = []
  for (const cluster of clusters) {
    const { category, source } = [...cluster].sort(rank)[0]
    let at = cluster[0].start
    const stop = cluster.reduce((hi, m) => Math.max(hi, m.end), 0)
    for (const [s, e] of ids) {
      if (e <= at || s >= stop) continue
      if (s > at) out.push({ start: at, end: s, category, source })
      at = Math.max(at, e)
    }
    if (at < stop) out.push({ start: at, end: stop, category, source })
  }
  return out
}

export function detect(text: string, ds: readonly Detector[]): Match[] {
  return resolve(text, ds.flatMap(d => d.detect(text)))
}
