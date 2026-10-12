#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// Replays the Bash commands in ~/.claude/projects/**/*.jsonl through one or two checkers and
// prints counts and 160-character excerpts. Local dev tool: transcripts can hold secrets, so
// never commit or paste its output beyond counts and a few short excerpts.
//
//   bun --no-env-file --config=/dev/null scripts/bash-replay.ts [--limit N] [A [B]]
//
// A checker is `path/to/module.ts#exportName` (a function from the command text to a JSON value)
// or `hook:<shell command>` (a PreToolUse hook: the payload goes on stdin, and the verdict is the
// exit code plus any permissionDecision). With no checker it runs the walker alone and reports
// parse errors and parse times. With one it counts verdicts. With two it lists disagreements.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { parse } from '../plugins/coremods/hooks/shell/walk'

const args = process.argv.slice(2)
const limitAt = args.indexOf('--limit')
const limit = limitAt >= 0 ? Number(args.splice(limitAt, 2)[1]) : Infinity
const specs = args

const excerpt = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 160)

function* bashCommands(root: string): Generator<string> {
  for (const rel of new Bun.Glob('**/*.jsonl').scanSync(root)) {
    for (const line of readFileSync(`${root}/${rel}`, 'utf8').split('\n')) {
      if (!line.includes('"name":"Bash"')) continue
      try {
        for (const item of JSON.parse(line).message?.content ?? []) {
          if (item.type === 'tool_use' && item.name === 'Bash' && typeof item.input?.command === 'string') yield item.input.command
        }
      } catch {
        // A truncated or foreign line is not a transcript entry; skip it.
      }
    }
  }
}

type Checker = (command: string) => unknown | Promise<unknown>

async function load(spec: string): Promise<Checker> {
  if (spec.startsWith('hook:')) {
    const cmd = spec.slice(5)
    return command => {
      const p = Bun.spawnSync(['sh', '-c', cmd], {
        stdin: Buffer.from(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })),
      })
      let decision = ''
      try {
        decision = JSON.parse(p.stdout.toString()).hookSpecificOutput?.permissionDecision ?? ''
      } catch {
        // No JSON on stdout means no permissionDecision.
      }
      return `exit ${p.exitCode}${decision ? ` ${decision}` : ''}`
    }
  }
  const [file, name] = spec.split('#')
  const fn = (await import(resolve(file)))[name]
  if (typeof fn !== 'function') throw new Error(`${spec}: ${name} is not a function`)
  return fn
}

const seen = new Set<string>()
let total = 0
for (const c of bashCommands(`${homedir()}/.claude/projects`)) {
  total++
  seen.add(c)
}
const unique = [...seen].slice(0, limit)
console.log(`commands: ${total} total, ${seen.size} unique${unique.length < seen.size ? `, replaying ${unique.length}` : ''}`)

if (specs.length === 0) {
  const times: number[] = []
  let parseErrors = 0
  const samples: string[] = []
  for (const c of unique) {
    const t0 = performance.now()
    const r = parse(c)
    times.push(performance.now() - t0)
    if (r.errors.length) {
      parseErrors++
      if (samples.length < 5) samples.push(`${r.errors[0].message} | ${excerpt(c)}`)
    }
  }
  times.sort((a, b) => a - b)
  const at = (q: number) => times[Math.min(times.length - 1, Math.floor(times.length * q))].toFixed(4)
  console.log(`parse errors: ${parseErrors} (${((100 * parseErrors) / unique.length).toFixed(3)}%)`)
  console.log(`parse ms: p50 ${at(0.5)}, p95 ${at(0.95)}, p99 ${at(0.99)}, max ${at(1)}`)
  console.log(`longest: ${Math.max(...unique.map(c => c.length))} chars; over 4000: ${unique.filter(c => c.length > 4000).length}`)
  for (const s of samples) console.log(`  error: ${s}`)
} else {
  const [a, b] = await Promise.all(specs.map(load))
  const tally = new Map<string, number>()
  let disagree = 0
  for (const c of unique) {
    const va = JSON.stringify(await a(c))
    tally.set(va, (tally.get(va) ?? 0) + 1)
    if (!b) continue
    const vb = JSON.stringify(await b(c))
    if (va !== vb) {
      disagree++
      console.log(`  ${va} -> ${vb} | ${excerpt(c)}`)
    }
  }
  console.log(`A verdicts: ${[...tally].map(([v, n]) => `${v} x${n}`).join(', ')}`)
  if (b) console.log(`disagreements: ${disagree} of ${unique.length}`)
}
