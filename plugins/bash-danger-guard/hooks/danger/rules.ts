// Pure verdicts for bash-danger-guard. Nothing here touches `$`.
// Ported from the archived coremods tool-mgr rules, keeping only the danger and ask rules and the
// parse-error and too-long guards.

import { askHit, dangerHit, envSplit, stdinReader, viewsOf } from './danger'
import type { AskRule, DangerRule } from './danger'
import { nestedScript, parse, reparse } from '../shell/walk'
import type { ShellCommand, ShellParse } from '../shell/walk'

export type Rule = DangerRule | 'parse-error' | 'too-long'
export type Hit = { rule: Rule; message: string }
export type AskHit = { rule: AskRule; message: string }

// Commands longer than this are denied unparsed.
export const MAX_PARSE = 64 * 1024

// Nested scripts and heredoc bodies may be reparsed up to this many characters in all. A script nested in itself
// (`eval "eval \"...\""`) is reparsed once per level, up to MAX_DEPTH levels, so only a command built to repeat one
// large text gets near it.
const MAX_REPARSE = 256 * 1024

const TOO_LONG = 'bash-danger-guard: this command is over 64 KB. Write it to a script file and run that.'
const TOO_COMPLEX = 'bash-danger-guard: this command nests too much script to check. Write it to a script file and run that.'

const prevStage = (c: ShellCommand) => {
  const p = c.pipeline
  return p ? p.prev.filter(e => e.pipeline?.stage === p.stage - 1) : []
}

// The heredoc bodies a command reads: its own, and those of the command piped into it.
const fedBodies = (c: ShellCommand) => [...c.heredocs, ...prevStage(c).flatMap(e => e.heredocs)].map(h => h.body)

// Whether a command, possibly path-qualified or behind wrappers, is a shell reading its program from stdin.
const readsShellStdin = (c: ShellCommand) => viewsOf(c.argv).some(v => stdinReader(v) === 'shell')

type Scan = { commands: ShellCommand[]; errors: ShellParse['errors']; tooComplex: boolean }

// Parses a command and every script it hands to a shell: `sh -c STR`, `eval` and `env -S` bodies (also behind wrappers)
// and heredoc bodies a shell reads all join `commands`. A heredoc body is reparsed once however many commands share it,
// and the reparsed text is capped (`tooComplex`).
function scan(command: string): Scan {
  const out: Scan = { commands: [], errors: [], tooComplex: false }
  let reparsed = 0
  const nested = (text: string, depth: number) => {
    reparsed += text.length
    if (reparsed > MAX_REPARSE) out.tooComplex = true
    else add(reparse(text, depth))
  }
  const add = (r: ShellParse) => {
    out.errors.push(...r.errors)
    for (const c of r.commands) {
      out.commands.push(c)
      for (const v of viewsOf(c.argv)) {
        const script = nestedScript(v) ?? envSplit(v)
        if (script !== null && !out.tooComplex) nested(script, c.depth + 1)
      }
    }
  }
  add(parse(command))
  // The command list is a worklist: a shell heredoc inside a reparsed body is read too.
  const bodies = new Set<string>()
  for (let i = 0; i < out.commands.length && !out.tooComplex; i++) {
    const c = out.commands[i]
    if (!readsShellStdin(c)) continue
    for (const body of fedBodies(c)) {
      if (bodies.has(body)) continue
      bodies.add(body)
      nested(body, c.depth + 1)
    }
  }
  return out
}

// The deny verdict for a Bash command: too long, unparseable, or a danger rule. Null lets it through.
export function classify(command: string): Hit | null {
  if (command.length > MAX_PARSE) return { rule: 'too-long', message: TOO_LONG }
  const { commands, errors, tooComplex } = scan(command)
  if (tooComplex) return { rule: 'too-long', message: TOO_COMPLEX }
  if (errors.length > 0) {
    // Deep inputs cascade into hundreds of errors; the first one names the cause.
    return {
      rule: 'parse-error',
      message: `bash-danger-guard: could not parse this command (${errors[0].message}). Rewrite it in plain bash, or write a script file and run it.`,
    }
  }
  return dangerHit(commands)
}

// The ask-tier rules (remote-exec, git-rewrite). A command classify() denies never reaches them, so a parse error has no ask.
export function askRule(command: string): AskHit | null {
  if (command.length > MAX_PARSE) return null
  const { commands, errors, tooComplex } = scan(command)
  return errors.length > 0 || tooComplex ? null : askHit(commands)
}

export type Verdict = { allow?: true; ask?: string; deny?: string; [key: string]: unknown }

// The stricter of a lower hook's verdict and our ask: deny beats ask, and ask beats allow or no answer.
function stricter(inner: Verdict, hit: AskHit): Verdict {
  if (inner.deny !== undefined || inner.ask !== undefined) return inner
  const { allow: _allow, ...rest } = inner
  return { ...rest, ask: hit.message }
}

// The classic.PreToolUse body for Bash. Our ask is worked out first, so a failing hook below cannot lose it; then the hooks
// below run and the stricter verdict wins. A deny from below always wins. A throw in our rules leaves the verdict from
// below alone and goes to `onError`.
export async function withAsk(command: string, next: () => Promise<Verdict | undefined>, onError: (err: unknown) => void): Promise<Verdict> {
  let hit: AskHit | null = null
  try {
    hit = askRule(command)
  } catch (err) {
    onError(err)
  }
  let inner: Verdict
  try {
    inner = (await next()) ?? {}
  } catch (err) {
    if (!hit) throw err
    onError(err)
    inner = {}
  }
  return hit ? stricter(inner, hit) : inner
}
