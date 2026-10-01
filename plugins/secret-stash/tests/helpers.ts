import type { RedactCtx } from '../hooks/redact.ts'
import type { Detector, Source } from '../hooks/types.ts'

export const KEY = new Uint8Array(32).fill(7)

export function regexDetector(re: RegExp, category: string, source: Source = 'openredaction'): Detector {
  return {
    source,
    detect: text => [...text.matchAll(re)].map(m => ({ start: m.index, end: m.index + m[0].length, category, source })),
  }
}

export function ctx(detectors: Detector[], over: Partial<RedactCtx> = {}): RedactCtx {
  return { detectors, key: KEY, idFor: () => undefined, deadline: Date.now() + 60_000, ...over }
}

export const bytes = (s: string) => new TextEncoder().encode(s)
export const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
export const rep = (n: number, v: number) => new Uint8Array(n).fill(v)
