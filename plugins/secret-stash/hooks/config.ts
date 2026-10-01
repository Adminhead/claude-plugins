import type { PluginOptions } from 'claude-code'
import { regexProblem } from './detectors/custom.ts'
import type { Io } from './io.ts'
import { categoryPatternNames, knownPatternNames, PRESETS } from './detectors/openredaction.ts'

export type CustomPattern = { type: string; regex: string }
export type SkipRestore = { tool: string; fields?: string[] }
export type ProjectConfig = {
  env: string[]
  pass: string[]
  envKeyRule: boolean
  skipRestore: SkipRestore[]
  openredaction: {
    patterns?: string[]
    categories: string[]
    preset: string | null
    whitelist: string[]
    customPatterns: CustomPattern[]
  }
}
export type Config = { envVars: string[]; projectFile: string; project: ProjectConfig }
export type ConfigError = { path: string; message: string }

export class ConfigInvalid extends Error {
  constructor(readonly errors: ConfigError[]) {
    super(`secret-stash config invalid: ${errors.map(e => `${e.path}: ${e.message}`).join('; ')}`)
  }
}

export const DEFAULT_PROJECT_FILE = '.secret-stash.json'
export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
// pass://<vault>/<item>/<field>; an item-level ref would print the whole item.
const PASS_REF = /^pass:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+$/

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

class Errors {
  list: ConfigError[] = []
  add(path: string, message: string) {
    this.list.push({ path, message })
  }
  throwIfAny() {
    if (this.list.length) throw new ConfigInvalid(this.list)
  }
  // The strings of `v` at `path`, each checked by `bad` (a message, or undefined when fine).
  strings(v: unknown, path: string, bad?: (s: string) => string | undefined): string[] {
    if (!Array.isArray(v)) {
      this.add(path, 'expected a list of strings')
      return []
    }
    const out: string[] = []
    v.forEach((x, i) => {
      const msg = typeof x === 'string' ? bad?.(x) : 'expected a string'
      if (msg) this.add(`${path}[${i}]`, msg)
      else out.push(x as string)
    })
    return out
  }
  unknownKeys(o: Record<string, unknown>, allowed: readonly string[], path: string) {
    // Names the position, never the key itself: the file's text stays out of errors.
    Object.keys(o).forEach((k, i) => {
      if (!allowed.includes(k)) this.add(path, `unknown key #${i + 1}; allowed: ${allowed.join(', ')}`)
    })
  }
}

const envName = (s: string) => (ENV_NAME.test(s) ? undefined : 'not a valid environment variable name')

export function parseOptions(o: PluginOptions): { envVars: string[]; projectFile: string } {
  const e = new Errors()
  // The engine supplies an unset field as '', and `multiple` may yield one bare string.
  const raw = typeof o.envVars === 'string' ? [o.envVars] : o.envVars ?? []
  const trimmed = Array.isArray(raw) ? raw.map(x => (typeof x === 'string' ? x.trim() : x)).filter(x => x !== '') : raw
  const envVars = e.strings(trimmed, 'envVars', envName)
  let projectFile = DEFAULT_PROJECT_FILE
  if (o.projectFile !== undefined) {
    if (typeof o.projectFile !== 'string') e.add('projectFile', 'expected a path')
    else if (o.projectFile.trim()) projectFile = o.projectFile.trim()
  }
  e.throwIfAny()
  return { envVars, projectFile }
}

function parseOpenredaction(v: unknown, e: Errors): ProjectConfig['openredaction'] {
  const out: ProjectConfig['openredaction'] = { categories: [], preset: null, whitelist: [], customPatterns: [] }
  if (v === undefined) return out
  if (!isRecord(v)) {
    e.add('openredaction', 'expected an object')
    return out
  }
  const at = 'openredaction'
  e.unknownKeys(v, ['patterns', 'categories', 'preset', 'whitelist', 'customPatterns'], at)
  if (v.patterns !== undefined) {
    const known = knownPatternNames()
    out.patterns = e.strings(v.patterns, `${at}.patterns`, s => (known.has(s) ? undefined : 'unknown openredaction pattern'))
  }
  if (v.categories !== undefined) {
    out.categories = e.strings(v.categories, `${at}.categories`, s =>
      categoryPatternNames(s).length ? undefined : 'unknown openredaction category')
  }
  if (v.preset !== undefined && v.preset !== null) {
    if (typeof v.preset !== 'string') e.add(`${at}.preset`, 'expected a string or null')
    else if (!PRESETS.includes(v.preset)) e.add(`${at}.preset`, `unknown preset (known: ${PRESETS.join(', ')})`)
    else out.preset = v.preset
  }
  if (v.whitelist !== undefined) out.whitelist = e.strings(v.whitelist, `${at}.whitelist`)
  if (v.customPatterns !== undefined) {
    if (!Array.isArray(v.customPatterns)) e.add(`${at}.customPatterns`, 'expected a list')
    else v.customPatterns.forEach((p, i) => parseCustom(p, `${at}.customPatterns[${i}]`, e, out.customPatterns))
  }
  return out
}

function parseCustom(p: unknown, path: string, e: Errors, into: CustomPattern[]) {
  if (!isRecord(p)) return e.add(path, 'expected an object with type and regex')
  e.unknownKeys(p, ['type', 'regex'], path)
  const typeOk = typeof p.type === 'string' && p.type.trim() !== ''
  if (!typeOk) e.add(`${path}.type`, 'expected a non-empty string')
  if (typeof p.regex !== 'string') return e.add(`${path}.regex`, 'expected a string')
  const problem = regexProblem(p.regex)
  if (problem) return e.add(`${path}.regex`, problem)
  if (typeOk) into.push({ type: p.type as string, regex: p.regex })
}

const emptyProject = (): ProjectConfig => ({
  env: [],
  pass: [],
  envKeyRule: true,
  skipRestore: [],
  openredaction: { categories: [], preset: null, whitelist: [], customPatterns: [] },
})

// Tools whose arguments are left unrestored: an exact name, or a prefix ending in a single `*`.
function parseSkipRestore(v: unknown, e: Errors): SkipRestore[] {
  if (!Array.isArray(v)) {
    e.add('skipRestore', 'expected a list')
    return []
  }
  const out: SkipRestore[] = []
  v.forEach((item, i) => {
    const at = `skipRestore[${i}]`
    if (!isRecord(item)) return e.add(at, 'expected an object with tool and optional fields')
    e.unknownKeys(item, ['tool', 'fields'], at)
    const entry: SkipRestore = { tool: '' }
    if (typeof item.tool !== 'string' || !item.tool) e.add(`${at}.tool`, 'expected a non-empty string')
    else if (item.tool.indexOf('*') !== -1 && item.tool.indexOf('*') !== item.tool.length - 1) {
      e.add(`${at}.tool`, '* may only appear at the end, as in mcp__acme_*')
    } else entry.tool = item.tool
    if (item.fields !== undefined) {
      const fields = e.strings(item.fields, `${at}.fields`, f => (f ? undefined : 'expected a non-empty string'))
      if (Array.isArray(item.fields) && !item.fields.length) e.add(`${at}.fields`, 'expected at least one field; omit fields to skip all')
      entry.fields = fields
    }
    if (entry.tool) out.push(entry)
  })
  return out
}

export function parseProjectFile(text: string): ProjectConfig {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    // The parser's message can quote file text, so report only a position when it gives one.
    const at = /position (\d+)/.exec((err as Error).message)?.[1]
    throw new ConfigInvalid([{ path: '', message: `not valid JSON${at ? ` (at character ${at})` : ''}` }])
  }
  if (!isRecord(raw)) throw new ConfigInvalid([{ path: '', message: 'expected a JSON object' }])
  const e = new Errors()
  e.unknownKeys(raw, ['env', 'pass', 'envKeyRule', 'skipRestore', 'openredaction'], '')
  const out: ProjectConfig = { ...emptyProject(), openredaction: parseOpenredaction(raw.openredaction, e) }
  if (raw.env !== undefined) out.env = e.strings(raw.env, 'env', envName)
  if (raw.pass !== undefined) {
    out.pass = e.strings(raw.pass, 'pass', s => (PASS_REF.test(s) ? undefined : 'expected pass://<vault>/<item>/<field>'))
  }
  if (raw.skipRestore !== undefined) out.skipRestore = parseSkipRestore(raw.skipRestore, e)
  if (raw.envKeyRule !== undefined) {
    if (typeof raw.envKeyRule === 'boolean') out.envKeyRule = raw.envKeyRule
    else e.add('envKeyRule', 'expected a boolean')
  }
  e.throwIfAny()
  return out
}

// Options plus the project file. A missing project file is fine; anything else wrong throws.
export async function loadConfig(io: Io, o: PluginOptions): Promise<Config> {
  const { envVars, projectFile } = parseOptions(o)
  const path = /^([A-Za-z]:)?[\\/]/.test(projectFile) ? projectFile : `${(await io.root()).replace(/\/+$/, '')}/${projectFile}`
  if (!(await io.exists(path))) {
    // Only the default file is optional; a typo in a chosen path would silently disable registration.
    if (projectFile !== DEFAULT_PROJECT_FILE) throw new ConfigInvalid([{ path: 'projectFile', message: `file not found: ${path}` }])
    return { envVars, projectFile, project: emptyProject() }
  }
  const text = await io.read(path)
  try {
    return { envVars, projectFile, project: parseProjectFile(text) }
  } catch (err) {
    if (!(err instanceof ConfigInvalid)) throw err
    throw new ConfigInvalid(err.errors.map(x => ({ ...x, path: `${projectFile}${x.path ? `#${x.path}` : ''}` })))
  }
}
