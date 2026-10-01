import { LiteOpenRedaction } from '../vendor/openredaction-lite.mjs'
import type { ProjectConfig } from '../config.ts'
import type { Detector } from '../types.ts'
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

let everything: Scannable[] | undefined
function allPatterns(): Scannable[] {
  // No restrictions: the library's whole pattern list.
  return (everything ??= new Lite().getPatterns())
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
