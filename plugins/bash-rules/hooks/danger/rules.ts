// Pure danger verdicts for bash-rules. Nothing here touches `$`.
// Ported from the archived coremods tool-mgr rules, keeping only the danger and ask rules and the
// parse-error and too-long guards.

import { askHit, baseName, dangerHit, handedScript, stdinReader, viewsOf } from './danger'
import type { AskRule, DangerRule } from './danger'
import { expandLiteralVars, reachOf } from './expand'
import { parse, reparse } from '../shell/walk'
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

// More commands than this (after nested scripts) are left to the model rather than walked pairwise.
export const MAX_COMMANDS = 400

const TOO_LONG = 'bash-rules: this command is over 64 KB. Write it to a script file and run that.'
const TOO_COMPLEX = 'bash-rules: this command nests too much script to check. Write it to a script file and run that.'

export const prevStage = (c: ShellCommand) => {
  const p = c.pipeline
  return p ? p.prev.filter(e => e.pipeline?.stage === p.stage - 1) : []
}

// The heredoc bodies a command reads: its own, and those of the command piped into it.
export const fedBodies = (c: ShellCommand) => [...c.heredocs, ...prevStage(c).flatMap(e => e.heredocs)].map(h => h.body)

// The literal here-strings a command reads.
const hereStrings = (c: ShellCommand) => c.redirects.flatMap(r => (r.op === '<<<' && r.target !== null ? [r.target] : []))

// Whether a command, possibly path-qualified or behind wrappers, is a shell reading its program from stdin.
const readsShellStdin = (c: ShellCommand) => viewsOf(c.argv).some(v => stdinReader(v) === 'shell')

// `scripts` holds the text of the command and of each script it hands over.
export type Scan = { commands: ShellCommand[]; scripts: string[]; errors: ShellParse['errors']; tooComplex: boolean }

// How a script runs: the command itself, in a shell of its own, or in the shell that holds the text (`eval`).
export type ScriptKind = 'top' | 'nested' | 'shared'

// Parses a command and every script it hands to a shell: `sh -c STR`, `eval` and `env -S` bodies, command-string
// wrappers (`flock -c`, `npx -c`, `watch`, a parallel template), also behind other wrappers, and heredoc bodies and literal
// here-strings a shell reads all join `commands`. A handed script that does not parse is a parse error. A body is reparsed once however many commands share it,
// and the reparsed text is capped (`tooComplex`). `write` rewrites each script before it is parsed.
export function scan(command: string, write: (text: string, kind: ScriptKind) => string = t => t): Scan {
  const out: Scan = { commands: [], scripts: [command], errors: [], tooComplex: false }
  let reparsed = 0
  const nested = (text: string, depth: number, kind: ScriptKind) => {
    out.scripts.push(text)
    // The cap counts what is parsed: a rewrite can make a short script much longer.
    const written = reparsed + text.length > MAX_REPARSE ? text : write(text, kind)
    reparsed += written.length
    if (reparsed > MAX_REPARSE) out.tooComplex = true
    else add(reparse(written, depth))
  }
  const add = (r: ShellParse) => {
    out.errors.push(...r.errors)
    for (const c of r.commands) {
      out.commands.push(c)
      // Two views can hand over one script (`busybox sh -c X` and its `sh -c X`): parse it once.
      const seen = new Set<string>()
      for (const v of viewsOf(c.argv)) {
        const script = handedScript(v)
        if (script === null || seen.has(script) || out.tooComplex) continue
        seen.add(script)
        nested(script, c.depth + 1, baseName(v[0] ?? null) === 'eval' ? 'shared' : 'nested')
      }
    }
  }
  add(parse(write(command, 'top')))
  // The command list is a worklist: a shell heredoc inside a reparsed body is read too.
  const bodies = new Set<string>()
  for (let i = 0; i < out.commands.length && !out.tooComplex; i++) {
    const c = out.commands[i]
    if (!readsShellStdin(c)) continue
    for (const body of [...fedBodies(c), ...hereStrings(c)]) {
      if (bodies.has(body)) continue
      bodies.add(body)
      nested(body, c.depth + 1, 'nested')
    }
  }
  return out
}

// A variable copied from another (`Y=$X`) is written in on a later pass.
const MAX_PASSES = 3

// Commands that exist only in the view without a variable. A wrapper reads its options wrongly once its program is gone, so
// what it seems to run there says nothing (expand.ts has already refused a wrapper with an expansion in that view).
export const withoutVariable = new WeakSet<ShellCommand>()

// The scan of a command with its literal variables written in (expand.ts), in the command and in each script it hands to a
// shell, each script on its own, or null when none were, or the rewrite is too long or complex to check. An `eval` body
// shares a shell with the text around it, so it is left alone, and so is any nested script when a function it could call
// exists. When a variable may hold nothing, what runs without it joins the scan, so every check sees both.
function expanded(command: string, s: Scan): Scan | null {
  const reach = reachOf(s.scripts, s.commands)
  if (reach.ifs) return null
  const rescan = (text: string) => {
    const r = scan(text)
    return r.tooComplex || r.errors.length > 0 ? null : r.commands
  }
  let wrote = false
  let vanishes = false
  let spent = 0
  const writer = (pick: 'text' | 'empty') => (script: string, kind: ScriptKind) => {
    if (kind === 'shared' || (kind === 'nested' && reach.functions)) return script
    const options = { nested: kind !== 'top', lookups: reach.lookups, home: reach.home, stuck: new Set<string>() }
    let text = script
    // Each pass parses a script several times, so the cap on what is reparsed covers it too. Past that nothing is written
    // in, and an assigned variable in a command word is denied.
    for (let pass = 0; pass < MAX_PASSES && spent <= MAX_REPARSE; pass++) {
      spent += text.length
      const w = expandLiteralVars(text, rescan, MAX_PARSE, options)
      if (w === null) break
      wrote = true
      vanishes ||= w.empty !== null
      // Only the first pass drops anything; it drops every such variable at once.
      text = pick === 'empty' && pass === 0 ? (w.empty ?? w.text) : w.text
    }
    return text
  }
  const x = scan(command, writer('text'))
  if (!wrote || spent > MAX_REPARSE || x.tooComplex || x.errors.length > 0) return null
  if (!vanishes) return x
  const e = scan(command, writer('empty'))
  if (spent > MAX_REPARSE || e.tooComplex || e.errors.length > 0) return null
  // Both views must fit what hygiene walks, or it would hand a deny to the model.
  if (x.commands.length + e.commands.length > MAX_COMMANDS) return null
  for (const c of e.commands) withoutVariable.add(c)
  return { ...x, commands: [...x.commands, ...e.commands] }
}

// The deny verdict for a Bash command: too long, unparseable, or a danger rule, with the scan it came from (null when the
// command was not parsed or was too complex) so later stages reuse it. A null hit lets it through. The scan is of the
// command with its literal variables written in, when it has any; the danger rules check both texts, so writing a
// variable in never drops a deny.
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
  const x = expanded(command, s)
  return { hit: (x && dangerHit(x.commands)) ?? dangerHit(s.commands), scan: x ?? s }
}

export const classify = (command: string): Hit | null => analyze(command).hit

// The ask-tier rules (remote-exec, git-rewrite, git-clean), over both the command and its literal-variable rewrite. A
// command classify() denies never reaches them, so a parse error has no ask.
export function askRule(command: string): AskHit | null {
  if (command.length > MAX_PARSE) return null
  const s = scan(command)
  if (s.errors.length > 0 || s.tooComplex) return null
  const x = expanded(command, s)
  return (x && askHit(x.commands)) ?? askHit(s.commands)
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
