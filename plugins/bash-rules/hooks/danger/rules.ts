// Pure danger verdicts for bash-rules. Nothing here touches `$`.
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

const TOO_LONG = 'bash-rules: this command is over 64 KB. Write it to a script file and run that.'
const TOO_COMPLEX = 'bash-rules: this command nests too much script to check. Write it to a script file and run that.'

export const prevStage = (c: ShellCommand) => {
  const p = c.pipeline
  return p ? p.prev.filter(e => e.pipeline?.stage === p.stage - 1) : []
}

// The heredoc bodies a command reads: its own, and those of the command piped into it.
export const fedBodies = (c: ShellCommand) => [...c.heredocs, ...prevStage(c).flatMap(e => e.heredocs)].map(h => h.body)

// Whether a command, possibly path-qualified or behind wrappers, is a shell reading its program from stdin.
const readsShellStdin = (c: ShellCommand) => viewsOf(c.argv).some(v => stdinReader(v) === 'shell')

export type Scan = { commands: ShellCommand[]; errors: ShellParse['errors']; tooComplex: boolean }

// Parses a command and every script it hands to a shell: `sh -c STR`, `eval` and `env -S` bodies (also behind wrappers)
// and heredoc bodies a shell reads all join `commands`. A heredoc body is reparsed once however many commands share it,
// and the reparsed text is capped (`tooComplex`).
export function scan(command: string): Scan {
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

// The deny verdict for a Bash command: too long, unparseable, or a danger rule, with the scan it came from (null when the
// command was not parsed or was too complex) so later stages reuse it. A null hit lets it through.
export function analyze(command: string): { hit: Hit | null; scan: Scan | null } {
  if (command.length > MAX_PARSE) return { hit: { rule: 'too-long', message: TOO_LONG }, scan: null }
  const s = scan(command)
  if (s.tooComplex) return { hit: { rule: 'too-long', message: TOO_COMPLEX }, scan: null }
  if (s.errors.length > 0) {
    // Deep inputs cascade into hundreds of errors; the first one names the cause.
    return {
      hit: {
        rule: 'parse-error',
        message: `bash-rules: could not parse this command (${s.errors[0].message}). Rewrite it in plain bash, or write a script file and run it.`,
      },
      scan: s,
    }
  }
  return { hit: dangerHit(s.commands), scan: s }
}

export const classify = (command: string): Hit | null => analyze(command).hit

// The ask-tier rules (remote-exec, git-rewrite, git-clean). A command classify() denies never reaches them, so a parse error has no ask.
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
// `exempt` drops a hit the caller can rule out with facts this file cannot see (git-clean in a linked worktree). `extra`
// supplies an ask from such facts (a SQL script file the caller could not read) when the rules find none.
export async function withAsk(
  command: string,
  next: () => Promise<Verdict | undefined>,
  onError: (err: unknown) => void,
  exempt?: (hit: AskHit) => Promise<boolean>,
  extra?: () => Promise<AskHit | null>,
): Promise<Verdict> {
  let hit: AskHit | null = null
  try {
    hit = askRule(command)
    if (hit && exempt && (await exempt(hit))) hit = null
    if (!hit && extra) hit = await extra()
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
