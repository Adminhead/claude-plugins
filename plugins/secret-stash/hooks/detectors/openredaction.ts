import { LiteOpenRedaction } from '../vendor/openredaction-lite.mjs'
import type { ProjectConfig } from '../config.ts'
import type { Detector } from '../types.ts'
import { looksLikeSecret } from './shape.ts'
import { deadlineFromNow, scanPatterns, type Scannable } from './scan.ts'

type OpenRedactionConfig = ProjectConfig['openredaction']

// The vendored build ships no types; this is the part of @openredaction/core 1.1.5 used here.
type Lite = { getPatterns(): Scannable[] }
type LiteCtor = new (options?: Record<string, unknown>) => Lite
const Lite = LiteOpenRedaction as unknown as LiteCtor

// Credential patterns used when the project file lists none.
export const DEFAULT_PATTERNS: readonly string[] = [
  'AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'AZURE_STORAGE_KEY', 'BEARER_TOKEN', 'FIREBASE_API_KEY',
  'GENERIC_API_KEY', 'GENERIC_SECRET', 'GITHUB_TOKEN', 'GOOGLE_API_KEY', 'HEROKU_API_KEY',
  'JWT_TOKEN', 'KUBERNETES_SECRET', 'MAILGUN_API_KEY', 'NPM_TOKEN', 'OAUTH_CLIENT_SECRET',
  'OAUTH_TOKEN', 'OPENAI_API_KEY', 'PRIVATE_KEY', 'PYPI_TOKEN', 'SENDGRID_API_KEY',
  'SLACK_TOKEN', 'SSH_PRIVATE_KEY', 'STRIPE_API_KEY', 'TWILIO_API_KEY', 'ANTHROPIC_API_KEY',
]

// Not in the library: Anthropic API keys (sk-ant-api03-..., sk-ant-admin01-..., sk-ant-oat01-...).
const ANTHROPIC: Scannable = {
  type: 'ANTHROPIC_API_KEY',
  regex: /\bsk-ant-[a-z0-9]+-[A-Za-z0-9_-]{20,}/g,
}

// Mirrors getPreset() in @openredaction/core 1.1.5, which ignores an unknown name silently.
export const PRESETS: readonly string[] = [
  'gdpr', 'hipaa', 'ccpa', 'healthcare', 'healthcare-provider', 'healthcare-research', 'finance',
  'financial-services', 'education', 'transport-logistics', 'transportation', 'logistics', 'pci-dss',
  'pci_dss', 'soc2', 'soc-2',
]

// Keyword-then-value patterns whose separator may be plain whitespace, so the "value" can be the
// next word of prose ("secret management", "access token verification-flow").
const KEYWORD_PATTERNS: ReadonlySet<string> = new Set([
  'GENERIC_SECRET', 'GENERIC_API_KEY', 'OAUTH_CLIENT_SECRET', 'OAUTH_TOKEN', 'BEARER_TOKEN',
])

function proseValue(value: string, context: string, at: number): boolean {
  const before = context.slice(0, at)
  const sep = /[:=\s]+$/.exec(before)?.[0] ?? ''
  // A separator that fills the whole context is unreadable; treat it as an assignment.
  if (sep.length === before.length || sep.includes('=')) return true
  return looksLikeSecret(value)
}

// The library's AWS secret pattern matches any 40-character run of [A-Za-z0-9/+=], paths and hashes
// included. Real keys are random base64 with at least two character classes, are not a run of
// lowercase path segments or a hex digest (git SHA-1), and are not cut from a longer base64 or path
// token. A key word may sit anywhere in the context, before or after, across lines (CSV headers,
// YAML values on the next line, trailing comments).
function isAwsSecret(value: string, context: string, at: number): boolean {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter(re => re.test(value)).length
  if (classes < 2) return false
  if (/^[0-9a-f]{40}$/.test(value) || /^[a-z0-9]*(?:\/[a-z0-9]*){2,}$/.test(value)) return false
  if (/[A-Za-z0-9+/]/.test(context[at - 1] ?? '') || /[A-Za-z0-9+/=]/.test(context[at + value.length] ?? '')) return false
  return /aws|amazon|secret|access.?key/i.test(context)
}

// The library's Heroku pattern matches any UUID and accepts "auth" anywhere in the context, so
// session ids in paths were stashed. A Heroku or API key word has to sit nearby, or an auth key
// word directly before the value (`X-Auth-Token: <uuid>`, `--auth-token <uuid>`, `Authorization: Bearer|Token|Basic <uuid>`; not `author`).
function isHerokuKey(_value: string, context: string, at: number): boolean {
  return /heroku|api[\s_.-]?key/i.test(context) || /auth(?!or(?!iz))[\w-]*["']?\s*[:=\s]\s*(?:(?:bearer|token|basic)\s+)?["']?$/i.test(context.slice(0, at))
}

// Adds our own check after the library's validator. The Heroku check replaces it.
function tightened(p: Scannable): Scannable {
  if (p.type === 'HEROKU_API_KEY') return { ...p, validator: isHerokuKey }
  const own: Scannable['validator'] =
    p.type === 'AWS_SECRET_KEY' ? isAwsSecret : KEYWORD_PATTERNS.has(p.type) ? proseValue : undefined
  if (!own) return p
  const base = p.validator
  return { ...p, validator: (value, context, at) => (base?.(value, context, at) ?? true) && own(value, context, at) }
}

let everything: Scannable[] | undefined
function allPatterns(): Scannable[] {
  // No restrictions: the library's whole pattern list.
  return (everything ??= new Lite().getPatterns().map(tightened))
}

// Every pattern name the config may list.
export function knownPatternNames(): Set<string> {
  return new Set([...allPatterns().map(p => p.type), ANTHROPIC.type])
}

// Pattern types a category selects; empty for an unknown category.
export function categoryPatternNames(category: string): string[] {
  return new Lite({ categories: [category] }).getPatterns().map(p => p.type)
}

// The library's own detect() is async and silently drops a pattern that overruns, so the adapter
// takes its pattern list (selection, presets) and runs the scan itself. The library applies
// `patterns` over `categories`; here they add up, and omitting `patterns` means the credential list.
function selectPatterns(c: OpenRedactionConfig): Scannable[] {
  const types = new Set(c.patterns ?? DEFAULT_PATTERNS)
  for (const cat of c.categories) for (const t of categoryPatternNames(cat)) types.add(t)
  if (c.preset) for (const p of new Lite({ preset: c.preset }).getPatterns()) types.add(p.type)
  const chosen = allPatterns().filter(p => types.has(p.type))
  // First, so it labels a key the generic sk- patterns also match (equal spans keep scan order).
  return types.has(ANTHROPIC.type) ? [ANTHROPIC, ...chosen] : chosen
}

// `whitelist` holds exact values; the library's own whitelist matches substrings, which would let
// a secret through whenever it happened to contain a listed word.
export function openredactionDetector(c: OpenRedactionConfig): Detector {
  const patterns = selectPatterns(c)
  const allow = new Set(c.whitelist)
  return {
    source: 'openredaction',
    detect: text => scanPatterns(text, patterns, 'openredaction', allow, deadlineFromNow()),
  }
}
