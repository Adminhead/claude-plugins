#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// PreToolUse hook: stops the agent weakening checks instead of fixing code.
//
// - Bash: denies git commands that skip hooks or signing (--no-verify, commit -n, --no-gpg-sign, -c core.hooksPath=...,
//   SKIP=/HUSKY=0/LEFTHOOK=0), and asks when a git command is too long or too odd to parse.
// - Edit, Write, MultiEdit: asks before changing an existing lint, format or hook config, or its ignore file.
//   Creating a new one passes.
//
// Prints one JSON decision or nothing, and always exits 0. An internal error prints `ask`, so a broken guard never
// silently lets a call through. Reasons are static apart from the config's base name.

import { lstatSync, readFileSync, writeSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { configVerdict, isProtectedName, sectionRule } from './config-protect.ts'
import { checkGit } from './git-bypass.ts'

const MAX_STDIN = 4 * 1024 * 1024
const MAX_FILE = 4 * 1024 * 1024

type Decision = { decision: 'deny' | 'ask'; reason: string } | null

// The config's current text, null when nothing is at the path, or false when something is there but cannot be read.
// lstat, so a dangling symlink at a config path still counts as present; any error but ENOENT counts as present.
function existing(path: string, needText: boolean): string | null | false {
  try {
    const st = lstatSync(path)
    if (!needText) return ''
    if (!st.isFile() || st.size > MAX_FILE) return false
    return readFileSync(path, 'utf8')
  } catch (err) {
    return (err as { code?: string }).code === 'ENOENT' ? null : false
  }
}

export function decide(input: any): Decision {
  const tool = input?.tool_name
  const ti = input?.tool_input ?? {}
  if (tool === 'Bash') {
    if (typeof ti.command !== 'string') return null
    const hit = checkGit(ti.command)
    if (!hit) return null
    return { decision: hit.rule === 'unparsed' ? 'ask' : 'deny', reason: hit.message }
  }
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') {
    if (typeof ti.file_path !== 'string' || ti.file_path === '') return null
    const name = ti.file_path.slice(ti.file_path.replace(/\\/g, '/').lastIndexOf('/') + 1)
    const named = isProtectedName(name)
    if (!named && !sectionRule(name)) return null
    const cwd = typeof input.cwd === 'string' ? input.cwd : '.'
    const path = isAbsolute(ti.file_path) ? ti.file_path : join(cwd, ti.file_path)
    const reason = configVerdict(tool, ti, existing(path, !named))
    return reason ? { decision: 'ask', reason } : null
  }
  return null
}

function main(): void {
  let out: Decision
  try {
    const raw = readFileSync(0, 'utf8')
    out = raw.length > MAX_STDIN ? { decision: 'ask', reason: 'check-bypass-guard: the tool input is too large to check.' } : decide(JSON.parse(raw))
  } catch {
    out = { decision: 'ask', reason: 'check-bypass-guard: the guard failed on this call, so it could not check it.' }
  }
  if (out) {
    const hookSpecificOutput = { hookEventName: 'PreToolUse', permissionDecision: out.decision, permissionDecisionReason: out.reason }
    writeSync(1, `${JSON.stringify({ hookSpecificOutput })}\n`)
  }
}

if (import.meta.main) main()
