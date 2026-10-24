// Decides whether an Edit, Write or MultiEdit touches an existing lint, format or hook config. Pure: the caller
// passes what is on disk. Creating a new config is allowed; changing one asks the person.
//
// Adapted from ECC's scripts/hooks/config-protection.js (MIT, (c) 2026 Affaan Mustafa), extended to Python, Go and
// Rust tools, pre-commit, and the lint sections of pyproject.toml, setup.cfg and tox.ini.

const NAMES = new Set([
  // ESLint
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts',
  // Prettier
  '.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.json', '.prettierrc.json5', '.prettierrc.yml',
  '.prettierrc.yaml', '.prettierrc.toml', 'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs', 'prettier.config.ts',
  // Biome, oxlint
  'biome.json', 'biome.jsonc', '.biome.json', '.biome.jsonc', '.oxlintrc.json',
  // Stylelint
  '.stylelintrc', '.stylelintrc.json', '.stylelintrc.yml', '.stylelintrc.yaml', '.stylelintrc.js', '.stylelintrc.cjs', '.stylelintrc.mjs',
  'stylelint.config.js', 'stylelint.config.cjs', 'stylelint.config.mjs', 'stylelint.config.ts',
  // markdownlint
  '.markdownlint.json', '.markdownlint.jsonc', '.markdownlint.yaml', '.markdownlint.yml', '.markdownlint.cjs', '.markdownlint.mjs',
  '.markdownlintrc', '.markdownlint-cli2.jsonc', '.markdownlint-cli2.yaml', '.markdownlint-cli2.cjs', '.markdownlint-cli2.mjs',
  // Shell
  '.shellcheckrc', 'shellcheckrc',
  // Python
  'ruff.toml', '.ruff.toml', '.flake8', 'mypy.ini', '.mypy.ini', '.pylintrc', 'pylintrc', 'pyrightconfig.json', '.isort.cfg',
  // Go, Rust
  '.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json', 'rustfmt.toml', '.rustfmt.toml', 'clippy.toml', '.clippy.toml',
  // Hook managers
  '.pre-commit-config.yaml', '.pre-commit-config.yml', 'lefthook.yml', 'lefthook.yaml', '.lefthook.yml', '.lefthook.yaml',
  // lint-staged and commitlint, which the hooks run
  '.lintstagedrc', '.commitlintrc',
  // Ignore files: one line in one silences a failing file without touching the code or the config.
  '.eslintignore', '.prettierignore', '.stylelintignore', '.markdownlintignore', '.markdownlint-cli2-ignore',
])

// Split configs (`eslint.config.base.mjs`, `.prettierrc.shared.yml`), and lint-staged and commitlint in every format.
const PATTERNS = [
  /^(?:eslint|prettier|stylelint|oxlint|lint-staged|commitlint)\.config(?:\.[A-Za-z0-9_-]+)*\.(?:js|mjs|cjs|ts|mts|cts)$/i,
  /^\.(?:eslintrc|prettierrc|stylelintrc|markdownlintrc|lintstagedrc|commitlintrc)(?:\.[A-Za-z0-9_-]+)*\.(?:js|cjs|mjs|ts|mts|cts|json|jsonc|json5|yml|yaml|toml)$/i,
]

// Files that mix lint settings with other content: only their lint sections are protected.
const SECTIONED: Record<string, RegExp> = {
  'pyproject.toml': /^tool\.(?:ruff|mypy|pylint|flake8|black|isort|pyright|basedpyright|pycodestyle|pydocstyle|bandit)(?:\.|$)/,
  'setup.cfg': /^(?:flake8|mypy(?:-.*)?|pycodestyle|pydocstyle|isort|pylint.*|tool:isort)$/,
  'tox.ini': /^(?:flake8|pycodestyle|pydocstyle|isort|mypy(?:-.*)?)$/,
}

const baseName = (p: string) => p.slice(p.replace(/\\/g, '/').lastIndexOf('/') + 1)

// Case-insensitive: on macOS and Windows `.ESLINTRC.JS` is the same file as `.eslintrc.js`.
export const isProtectedName = (name: string) => NAMES.has(name.toLowerCase()) || PATTERNS.some(re => re.test(name))
export const sectionRule = (name: string): RegExp | null => SECTIONED[name.toLowerCase()] ?? null

// A line's section header (TOML `[a.b]` and `[[a.b]]`, INI `[name]`) with quotes and spaces dropped, or null. Only short
// lines that start with `[` reach the regex, so it never runs on a long model-written line.
function header(line: string): string | null {
  const t = line.trim()
  if (t[0] !== '[' || t.length > 256) return null
  const m = /^\[\[?([^\]]+)\]\]?\s*(?:[#;].*)?$/.exec(t)
  return m ? m[1].replace(/["'\s]/g, '') : null
}

// The header that governs a line.
function headerAt(lines: readonly string[], index: number): string | null {
  for (let i = index; i >= 0; i--) {
    const h = header(lines[i])
    if (h !== null) return h
  }
  return null
}

// The lines under protected headers, joined, so two versions of a file can be compared section by section.
export function protectedSections(text: string, rule: RegExp): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let current: string | null = null
  for (const line of lines) {
    const h = header(line)
    if (h !== null) current = h
    if (current !== null && rule.test(current)) out.push(line.trimEnd())
  }
  return out.join('\n')
}

// Whether a replacement of `oldText` in `content` touches a protected section: the old text sits under one, or the
// new text adds a protected header. An old text that cannot be found counts, so a mismatch errs toward asking.
function editTouches(content: string, rule: RegExp, oldText: string, newText: string): boolean {
  if (protectedSections(newText, rule) !== '') return true
  if (oldText === '') return protectedSections(content, rule) !== ''
  const at = content.indexOf(oldText)
  if (at < 0) return true
  const before = content.slice(0, at).split(/\r?\n/)
  const start = before.length - 1
  const span = oldText.split(/\r?\n/).length
  const lines = content.split(/\r?\n/)
  let current = headerAt(lines, start)
  for (let i = start; i < start + span && i < lines.length; i++) {
    current = header(lines[i]) ?? current
    if (current !== null && rule.test(current)) return true
  }
  return false
}

export type Edit = { old_string?: unknown; new_string?: unknown }
export type ToolInput = { file_path?: unknown; content?: unknown; old_string?: unknown; new_string?: unknown; edits?: unknown }

// `existing` is the file's current text, null when there is no file, or false for one that exists but could not be read.
export function configVerdict(tool: string, input: ToolInput, existing: string | null | false): string | null {
  const path = typeof input.file_path === 'string' ? input.file_path : ''
  if (!path || existing === null) return null
  const name = baseName(path)
  const ask = `check-bypass-guard: ${name.slice(0, 80)} configures a linter, formatter or git hook. Fix the code the check reports rather than loosening the check; change the config only if the user asked for it.`
  if (isProtectedName(name)) return ask
  const rule = sectionRule(name)
  if (!rule) return null
  if (existing === false) return ask
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  if (tool === 'Write') return protectedSections(existing, rule) === protectedSections(str(input.content), rule) ? null : ask
  const edits: Edit[] = tool === 'MultiEdit' ? (Array.isArray(input.edits) ? input.edits : []) : [input]
  let content = existing
  for (const e of edits) {
    const oldText = str(e?.old_string)
    const newText = str(e?.new_string)
    if (editTouches(content, rule, oldText, newText)) return ask
    content = content.replace(oldText, () => newText)
  }
  return null
}
