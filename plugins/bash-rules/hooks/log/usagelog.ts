// The usage log shared by the mods that write it (usage-log, bash-rules): one JSON object per line, in daily files
// under ${CLAUDE_USAGE_LOG_DIR:-${XDG_STATE_HOME:-~/.local/state}/claude-usage}. Pure: the caller runs the argv this
// returns through `$.process.run` with the line on stdin, because `$.fs.write` replaces a whole file and has no append.
// Canonical copy in scripts/shared/log/; `scripts/plugins.py sync-shared` copies it into each plugin.

export const SCHEMA = 1

// A logged string field is cut to this many characters, after redaction.
export const MAX_FIELD = 4000

// Secret shapes masked before anything is written. Commands and prompts can carry exported keys, so this runs on every
// string field. It targets common token formats; it is not a guarantee.
const SECRETS: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '<private-key>'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, '<github-token>'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '<github-token>'],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, '<api-key>'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '<aws-key>'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '<slack-token>'],
  [/\bAIza[0-9A-Za-z_-]{35}/g, '<google-key>'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '<jwt>'],
  [/\b(Bearer|Basic|token)(\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1$2<token>'],
  [/\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIALS?)[A-Za-z0-9_]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"';&|]+)/gi, '$1$2<redacted>'],
  [/(:\/\/[^/\s:@]+:)[^@\s/]+@/g, '$1<redacted>@'],
]

export function redact(text: string): string {
  let out = text
  for (const [re, to] of SECRETS) out = out.replace(re, to)
  return out
}

// Redacted, then cut to `max` characters with a marker of how much was dropped.
export function clip(text: string, max = MAX_FIELD): string {
  const r = redact(text)
  return r.length > max ? `${r.slice(0, max)}…[+${r.length - max}]` : r
}

// One log line. String fields are redacted and clipped here; nested objects are the caller's to clip.
export function line(kind: string, fields: Readonly<Record<string, unknown>>, now: number): string {
  const out: Record<string, unknown> = { v: SCHEMA, ts: new Date(now).toISOString(), kind }
  for (const [k, val] of Object.entries(fields)) {
    if (val === undefined) continue
    out[k] = typeof val === 'string' ? clip(val) : val
  }
  return `${JSON.stringify(out)}\n`
}

// `<stream>-YYYY-MM-DD.jsonl` in UTC. Each writer has its own stream, so no two processes append to one file.
export function logFile(stream: string, now: number): string {
  if (!/^[a-z][a-z0-9-]*$/.test(stream)) throw new Error(`bad log stream name: ${stream}`)
  return `${stream}-${new Date(now).toISOString().slice(0, 10)}.jsonl`
}

const DIR = 'd="${CLAUDE_USAGE_LOG_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/claude-usage}"'

// Appends stdin to the stream's file. The directory and files are private to the user.
export const appendArgv = (file: string): string[] => ['sh', '-c', `umask 077; ${DIR}; mkdir -p "$d" && cat >> "$d/$1"`, 'sh', file]

// Deletes log files older than `days` days.
export const pruneArgv = (days: number): string[] => [
  'sh',
  '-c',
  `${DIR}; [ -d "$d" ] && find "$d" -maxdepth 1 -type f -name '*.jsonl' -mtime +"$1" -delete; exit 0`,
  'sh',
  String(Math.max(1, Math.floor(days))),
]
