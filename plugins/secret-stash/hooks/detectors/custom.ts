import type { CustomPattern } from '../config.ts'
import type { Detector } from '../types.ts'
import { deadlineFromNow, scanPatterns } from './scan.ts'

const MAX_SOURCE_LEN = 500
const MAX_REPEAT = 512
const MIN_PREFIX = 3

// Custom patterns are a safe subset of JS regex. Detectors run over the whole text, a synchronous
// overrun fails open, and scan.ts only notices one after the exec returns, so this guard is the
// defense. A pattern is accepted only when it:
//   - is at most 500 characters and compiles
//   - has no backreference and no top-level alternation
//   - uses only bounded quantifiers, {n} or {n,m} with m <= 512 (no * + ? or {n,}), and at most one
//     of them variable-length ({n,m} with m > n); the rest must be fixed {n}
//   - holds at most one variable element in all: a {n,m} quantifier or an alternation group
//   - starts with a literal prefix of at least 3 characters, after an optional \b
//   - repeats no group that holds a variable quantifier or an alternation
// Returns the first rule broken, with the fix, or undefined when the pattern passes.
//
// Residual risk: one variable quantifier costs at most a few hundred steps per start position, but
// a static check cannot prove safety. Custom patterns are written by the repo owner, so this guards against mistakes,
// not attacks.
export function regexProblem(source: string): string | undefined {
  if (source.length > MAX_SOURCE_LEN) {
    return `length: pattern is ${source.length} characters, over the ${MAX_SOURCE_LEN} limit; split it into several patterns`
  }
  try {
    new RegExp(source)
  } catch (e) {
    return `invalid regex: ${(e as Error).message}`
  }
  return (
    backreferenceProblem(source) ??
    quantifierProblem(source) ??
    alternationProblem(source) ??
    variableProblem(source) ??
    prefixProblem(source) ??
    nestedProblem(source)
  )
}

const QUANTIFIER = /^\{(\d+)(?:(,)(\d*))?\}/

function backreferenceProblem(s: string): string | undefined {
  return /(?:^|[^\\])(?:\\\\)*\\(?:[1-9]|k<)/.test(s)
    ? 'backreference: not allowed; repeat the group\'s pattern instead'
    : undefined
}

// Calls `visit(char, index)` for every regex token char outside escapes, classes and `(?` syntax.
function walk(s: string, visit: (c: string, i: number) => string | undefined): string | undefined {
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      i++
    } else if (c === '[') {
      for (i++; i < s.length && s[i] !== ']'; i++) if (s[i] === '\\') i++
    } else {
      const found = visit(c, i)
      if (found) return found
      if (c === '(' && s[i + 1] === '?') i++
    }
  }
  return undefined
}

function quantifierProblem(s: string): string | undefined {
  return walk(s, (c, i) => {
    if (c === '*') return `bounded quantifiers: use {0,${MAX_REPEAT}} instead of *`
    if (c === '+') return `bounded quantifiers: use {1,${MAX_REPEAT}} instead of +`
    if (c === '?') return 'bounded quantifiers: use {0,1} instead of ?'
    if (c !== '{') return undefined
    const m = QUANTIFIER.exec(s.slice(i, i + 24))
    if (!m) return undefined
    if (m[2] && m[3] === '') return `bounded quantifiers: give {${m[1]},} an upper bound, such as {${m[1]},${MAX_REPEAT}}`
    const max = Number(m[3] ?? m[1])
    if (max > MAX_REPEAT) return `bounded quantifiers: {${m[0].slice(1, -1)}} exceeds the ${MAX_REPEAT} limit; use at most {n,${MAX_REPEAT}}`
    return undefined
  })
}

function alternationProblem(s: string): string | undefined {
  let depth = 0
  return walk(s, c => {
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === '|' && depth === 0) return 'top-level alternation: write one pattern per alternative'
    return undefined
  })
}

// Variable elements multiply: each can match in several ways at every position, so two together
// (or an alternation next to a {n,m}) cost the product, and forty of them never finish.
function variableProblem(s: string): string | undefined {
  const groups: boolean[] = []
  let count = 0
  return walk(s, (c, i) => {
    if (c === '(') groups.push(false)
    else if (c === '|' && groups.length) groups[groups.length - 1] = true
    else if (c === ')' && groups.pop()) count++
    else if (quantifierAt(s, i)?.variable) count++
    return count > 1
      ? 'variable elements: only one variable-length element allowed, a {n,m} quantifier or an alternation group; use fixed {n} quantifiers and split alternatives into one pattern each'
      : undefined
  })
}

// Literal characters that open the pattern: plain chars or escaped punctuation. A literal that a
// {n,m} quantifier follows is part of the repeat, not the prefix.
function prefixProblem(s: string): string | undefined {
  let i = s.startsWith('\\b') ? 2 : 0
  let count = 0
  while (i < s.length) {
    const c = s[i]
    let len = 1
    if (c === '\\') {
      if (!/[\\^$.|?*+()[\]{}/-]/.test(s[i + 1] ?? '')) break
      len = 2
    } else if ('^$.|?*+()[]{'.includes(c)) {
      break
    }
    if (QUANTIFIER.test(s.slice(i + len, i + len + 24))) break
    count++
    i += len
  }
  if (count >= MIN_PREFIX) return undefined
  return `literal prefix: pattern must start with at least ${MIN_PREFIX} literal characters (found ${count}), such as itk_ before the character class; add the vendor's fixed prefix`
}

type Quantifier = { len: number; variable: boolean; repeats: boolean }

// The {n} / {n,m} quantifier starting at `i`, if any. `variable` means its count can differ
// between matches; `repeats` means it can match its atom more than once.
function quantifierAt(s: string, i: number): Quantifier | undefined {
  const m = s[i] === '{' ? QUANTIFIER.exec(s.slice(i, i + 24)) : null
  if (!m) return undefined
  const min = Number(m[1])
  const max = m[3] ? Number(m[3]) : min
  return { len: m[0].length, variable: min !== max, repeats: max > 1 }
}

function nestedProblem(s: string): string | undefined {
  // One entry per open group: does its content hold a variable quantifier or an alternation?
  const groups: boolean[] = []
  const mark = () => {
    if (groups.length) groups[groups.length - 1] = true
  }
  return walk(s, (c, i) => {
    if (c === '(') groups.push(false)
    else if (c === '|') mark()
    else if (c === ')') {
      const inner = groups.pop() ?? false
      if (inner && quantifierAt(s, i + 1)?.repeats) return 'nested quantifier: a repeated group holds a variable quantifier or alternation; unroll it or make the inner part fixed-width'
      if (inner) mark()
    } else if (quantifierAt(s, i)?.variable) mark()
    return undefined
  })
}

export function customDetector(patterns: readonly CustomPattern[], whitelist: readonly string[]): Detector {
  const compiled = patterns.map(p => ({ type: p.type, regex: new RegExp(p.regex, 'g') }))
  const allow = new Set(whitelist)
  return {
    source: 'custom',
    detect: text => scanPatterns(text, compiled, 'custom', allow, deadlineFromNow()),
  }
}
