import type { Detector, Match } from '../types.ts'

// Key-name parts that mark a value as sensitive. Parts split on _ - . and camelCase boundaries.
// A part matches when it ends with a term (a trailing S is ignored), so apiKey, client_secrets and
// run-together names like APIKEY or DBPASSWORD hit while keyboard and author do not. Names such
// as MONKEY are over-redacted on purpose.
const TERMS = ['SECRET', 'TOKEN', 'KEY', 'PASSWORD', 'PASSWD', 'PASSPHRASE', 'PASS', 'PWD', 'CREDENTIAL', 'AUTH', 'PRIVATE', 'DSN']
const URL_USERINFO = /^[a-z][a-z0-9+.-]*:\/\/[^/?#\s]*@/i

function keyParts(key: string): string[] {
  return key
    .split(/[_\-.]/)
    .flatMap(p => p.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(' '))
    .map(p => p.toUpperCase())
    .filter(Boolean)
}

// Keys that name a credential outright; their values are never dismissed as prose.
const STRONG = ['PASSWORD', 'PASSWD', 'PASSPHRASE', 'SECRET', 'PWD', 'PRIVATE']
const strongKey = (parts: string[]) => parts.some(p => STRONG.some(t => p.endsWith(t) || p.replace(/S$/, '').endsWith(t)))

function sensitiveKey(parts: string[]): boolean {
  return parts.some(p => TERMS.some(t => p.endsWith(t) || p.replace(/S$/, '').endsWith(t)))
}

// What tools put before a line: a line number (Read's tab or arrow, cat -n's spaces), grep's
// path:line: / path-line- / path:, each bounded.
const PREFIXES = [String.raw`\d{1,7}(?:→|[ \t])`, String.raw`[^\s:]{1,256}[:-]\d{1,7}[:-]`, String.raw`[^\s:]{1,256}:`]
const OUTPUT_PREFIX = PREFIXES.join('|')
// Each prefix form anchored, to strip it from the lines that follow a key line.
const PREFIX_RES = PREFIXES.map(p => new RegExp(String.raw`^[ \t]*(?:${p})`))

// A key, then = or :. Optional quotes around the key (JSON) and a leading export (.env).
// LINE sits at the start of a line, after an optional output prefix, diff sign or YAML list dash,
// and takes any value (.env, YAML, JSON). INLINE finds a
// quoted value anywhere (minified JSON, `apiKey: "x"` or `api_key = 'x'` in code).
const KEY_AND_SEP = String.raw`(?<q>["']?)(?<key>[A-Za-z_][\w.-]*)\k<q>[ \t]*(?<sep>[=:])[ \t]*`
const LINE = new RegExp(String.raw`^(?<pre>[ \t]*(?:(?:${OUTPUT_PREFIX})[ \t]*)?)(?:[+-][ \t]*)?(?:-[ \t]+)?(?:export[ \t]+)?` + KEY_AND_SEP, 'gm')
const INLINE = new RegExp(String.raw`(?<![\w.-])` + KEY_AND_SEP + `(?=["'])`, 'g')

// How far to look for a closing quote before calling it unclosed.
const QUOTE_SCAN = 16_384

// The value starting at `at` in `text`, as [start, end). A double-quoted value runs to its closing
// unescaped quote, across lines. A single-quoted one closes on its line. An unclosed quote takes
// the rest of its line. Unquoted, it runs to a trailing comment (whitespace then #), trimmed.
function valueSpan(text: string, at: number, lineEnd: number): [number, number] {
  const q = text[at]
  if (q === '"') {
    const limit = Math.min(text.length, at + QUOTE_SCAN)
    for (let i = at + 1; i < limit; i++) {
      if (text[i] === '\\') i++
      else if (text[i] === '"') return [at + 1, i]
    }
  } else if (q === "'") {
    const close = text.indexOf("'", at + 1)
    if (close > 0 && close < lineEnd) return [at + 1, close]
  }
  if (q === '"' || q === "'") return [at + 1, at + 1 + text.slice(at + 1, lineEnd).trimEnd().length]
  const rest = text.slice(at, lineEnd)
  const comment = rest.search(/\s#/)
  return [at, at + (comment < 0 ? rest : rest.slice(0, comment)).trimEnd().length]
}

// YAML block scalar header: | or > with optional chomping and indent indicators.
const BLOCK_SCALAR = /^[|>][+-]?\d?[+-]?$/
// An unquoted value that is code or a reference, not a literal: a call, process.env.X,
// os.environ[...], or a whole $VAR / ${VAR} (a longer value that starts with $ is a password).
const EXPRESSION = /^(?:[\w.$]+\(.*\)[;,]?|process\.env\b.*|os\.environ\b.*|\$\{?[A-Za-z_]\w*\}?)$/

// The body of a block scalar: one [start, end) span per non-blank line after `from` that is
// indented deeper than `indent`, covering the line's text without its tool prefix or indentation.
// `strip` removes the tool prefix from each line first, so indent is measured on the content.
function blockBody(text: string, from: number, indent: number, strip: RegExp | undefined): [number, number][] {
  const spans: [number, number][] = []
  for (let pos = from; pos < text.length; ) {
    const nl = text.indexOf('\n', pos)
    const lineEnd = nl < 0 ? text.length : nl
    const line = text.slice(pos, lineEnd)
    const cut = strip ? strip.exec(line)?.[0].length : 0
    if (cut === undefined) break
    const rest = line.slice(cut)
    if (rest.trim()) {
      const lead = rest.length - rest.trimStart().length
      if (lead <= indent) break
      spans.push([pos + cut + lead, pos + line.trimEnd().length])
    }
    if (nl < 0) break
    pos = nl + 1
  }
  return spans
}

// A block scalar becomes one match per body line, each its own secret: the line's text without its
// prefix or indentation, so restoring an ID never brings a line number into the value, and the same
// key redacts the same way with or without a tool prefix. A line under MIN_SECRET_LEN is dropped by
// detect(), so a short last line stays visible.
//
// Stashes the value of a sensitive-looking key, never the key: KEY=value lines, YAML `key: value`,
// JSON `"key": "value"`, and quoted assignments in code. A `*_URL` key counts when its value
// carries userinfo, and the whole URL is stashed: a password alone can fall under MIN_SECRET_LEN
// and would then go unprotected, while the URL never does.
export function envRuleDetector(): Detector {
  return {
    source: 'env',
    detect(text) {
      const out: Match[] = []
      const seen = new Set<number>()
      for (const re of [LINE, INLINE]) {
        for (const m of text.matchAll(re)) {
          const at = m.index + m[0].length
          const nl = text.indexOf('\n', at)
          const first = valueSpan(text, at, nl < 0 ? text.length : nl)
          let spans: [number, number][] = [first]
          const value = text.slice(first[0], first[1])
          const quoted = text[at] === '"' || text[at] === "'"
          if (!quoted && re === LINE && BLOCK_SCALAR.test(value) && nl >= 0) {
            const pre = m.groups?.pre ?? ''
            const strip = PREFIX_RES.find(r => r.test(pre))
            const rest = m[0].slice(strip ? strip.exec(pre)![0].length : 0)
            const body = blockBody(text, nl + 1, rest.length - rest.trimStart().length, strip)
            if (body.length) spans = body
          } else if (!quoted && EXPRESSION.test(value)) continue
          const parts = keyParts(m.groups!.key)
          // `key: some prose` is YAML text, not a secret. Only a colon form skips, never KEY=value or
          // a key that names a password or secret outright.
          if (!quoted && m.groups!.sep === ':' && /\s/.test(value) && !strongKey(parts)) continue
          const sensitive = sensitiveKey(parts) || (parts.at(-1) === 'URL' && URL_USERINFO.test(value))
          if (!sensitive) continue
          for (const [from, to] of spans) {
            if (to <= from || seen.has(from)) continue
            seen.add(from)
            out.push({ start: from, end: to, category: 'ENV', source: 'env' })
          }
        }
      }
      return out
    },
  }
}
