#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// usage-report: summarizes the usage log that usage-log and bash-rules write, as Markdown.
//
//   usage-report.ts [--days N] [--dir PATH] [--judge [--limit N] [--model M]]
//
// Skills: uses per skill, by the Skill tool or otherwise, main loop or subagent; listed skills never used; listing cuts.
// Agents: Agent tool calls per type, with the model and effort each requested, and the resolved model and effort per
// loop. Bash: decisions by stage, rule and category, the model stages' sources, confidence and time, and what the
// next Bash call in the same loop was after a deny.
// --judge asks a model (claude -p, haiku by default) which listed skills each logged prompt should have loaded, and
// compares that with what loaded: missed and unneeded skills. It sends the prompts and skill descriptions to the model
// and costs tokens, so it is opt-in and capped by --limit.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export type Line = { v: number; ts: string; kind: string; session?: string; [k: string]: any }

export const logDir = (env: Record<string, string | undefined> = process.env) =>
  env.CLAUDE_USAGE_LOG_DIR || join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local/state'), 'claude-usage')

// Lines from `<stream>-YYYY-MM-DD.jsonl` files no older than `days` days; unreadable lines are skipped.
export function readLog(dir: string, days: number, now = Date.now()): Line[] {
  if (!existsSync(dir)) return []
  const cutoff = new Date(now - days * 86400_000).toISOString().slice(0, 10)
  const out: Line[] = []
  for (const f of readdirSync(dir).sort()) {
    const m = /-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f)
    if (!m || m[1]! < cutoff) continue
    for (const raw of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!raw.trim()) continue
      try {
        const l = JSON.parse(raw)
        if (l && typeof l.kind === 'string') out.push(l)
      } catch {
        // A torn or foreign line.
      }
    }
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts))
}

const count = <T>(xs: T[], key: (x: T) => string | undefined) => {
  const m = new Map<string, number>()
  for (const x of xs) {
    const k = key(x)
    if (k !== undefined) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

const table = (head: string[], rows: (string | number)[][]) =>
  rows.length === 0 ? '_None._\n' : [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n') + '\n'

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 80)
const pct = (n: number, d: number) => (d === 0 ? '-' : `${Math.round((100 * n) / d)}%`)

// The names one listing line offers: the context's skills and the plugin and user commands (plugin skills among them).
export const listedNames = (l: Line): string[] => [...new Set([...(l.skills ?? []), ...(l.commands ?? [])].map((s: any) => s.name))]

// name -> description for one listing: a command's own description, else the SKILL.md one.
export function candidates(l: Line | undefined, descs: Map<string, string>): [string, string][] {
  if (!l) return []
  const own = new Map<string, string>((l.commands ?? []).map((c: any) => [c.name, c.description ?? '']))
  return listedNames(l).map(n => [n, own.get(n) || describe(descs, n) || ''] as [string, string]).filter(([, d]) => d)
}

export function skillSection(lines: Line[]): string {
  const prompts = lines.filter(l => l.kind === 'prompt')
  const expansions = lines.filter(l => l.kind === 'skill')
  const calls = lines.filter(l => l.kind === 'skill-call')
  const listings = lines.filter(l => l.kind === 'listing')
  const out: string[] = ['## Skills\n']

  const viaTool = new Map(count(calls, c => c.skill))
  const bySub = new Map(count(calls.filter(c => c.agentId), c => c.skill))
  const errors = new Map(count(calls.filter(c => c.isError || c.denied), c => c.skill))
  out.push(table(
    ['Skill', 'Loaded', 'Skill tool', 'In subagents', 'Errors'],
    count(expansions, e => e.skill).map(([s, n]) => [cell(s), n, viaTool.get(s) ?? 0, bySub.get(s) ?? 0, errors.get(s) ?? 0]),
  ))

  const withSkill = new Set(expansions.map(e => `${e.session}#${e.prompt}`))
  const promptsWith = prompts.filter(p => withSkill.has(`${p.session}#${p.prompt}`)).length
  out.push(`\n${prompts.length} prompts in ${new Set(prompts.map(p => p.session)).size} sessions; ${promptsWith} (${pct(promptsWith, prompts.length)}) loaded at least one skill.\n`)
  const slash = count(prompts, p => p.slash)
  if (slash.length) out.push(`\nTyped commands: ${slash.slice(0, 15).map(([s, n]) => `\`/${s}\` ${n}`).join(', ')}\n`)

  const used = new Set(expansions.map(e => e.skill))
  const listed = new Set(listings.flatMap(listedNames))
  const unused = [...listed].filter(n => !used.has(n)).sort()
  out.push(`\n### Listed, never loaded (${unused.length} of ${listed.size})\n\n${unused.length ? unused.map(n => `\`${n}\``).join(', ') : '_None._'}\n`)

  const cut = listings.filter(l => typeof l.included === 'number' && l.included < l.total)
  if (cut.length) out.push(`\n**Listing cut:** ${cut.length} listing(s) showed fewer skills than installed (worst ${Math.min(...cut.map(l => l.included))} of ${Math.max(...cut.map(l => l.total))}). Skills past the budget were never visible to Claude.\n`)
  return out.join('')
}

export function agentSection(lines: Line[]): string {
  const calls = lines.filter(l => l.kind === 'agent-call')
  const asked = (c: Line) => [c.model, c.effort].filter(Boolean).join('/') || '-'
  const out = [`## Agents\n\n${table(['Agent type', 'Calls', 'From subagents', 'Requested model/effort'], count(calls, c => c.type).map(([t, n]) => [cell(t), n, calls.filter(c => c.type === t && c.agentId).length, cell(count(calls.filter(c => c.type === t), asked).map(([k, m]) => `${k} x${m}`).join(', '))]))}`]
  // model-step lines are logged when a loop's resolved pair changes, so these count loops, not requests.
  const steps = lines.filter(l => l.kind === 'model-step')
  out.push(`\n### Models by loop\n\nResolved model and effort, one count per change within a loop (a subagent's first request always counts).\n\n`)
  out.push(table(['Loop', 'Model', 'Effort', 'Count'], count(steps, s => `${s.agentId ? 'subagent' : 'main'}\t${s.model}\t${s.effort ?? '-'}`).map(([k, n]) => [...k.split('\t').map(cell), n])))
  return out.join('')
}

// What the next Bash call in the same session and loop did after each deny.
export function afterDeny(bash: Line[]): [string, number][] {
  const next = new Map<string, number>()
  bash.forEach((l, i) => {
    if (l.decision !== 'deny') return
    const loop = `${l.session}/${l.agentId ?? 'main'}`
    const n = bash.slice(i + 1).find(m => `${m.session}/${m.agentId ?? 'main'}` === loop)
    const k = !n ? 'no further Bash' : n.command === l.command ? 'same command again' : n.decision === 'deny' ? 'another deny' : 'a different command ran'
    next.set(k, (next.get(k) ?? 0) + 1)
  })
  return [...next.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export function bashSection(lines: Line[]): string {
  const bash = lines.filter(l => l.kind === 'bash')
  const asks = lines.filter(l => l.kind === 'bash-ask')
  const denies = bash.filter(l => l.decision === 'deny')
  const out: string[] = [`## Bash guard\n\n${bash.length} commands: ${count(bash, l => l.decision).map(([d, n]) => `${d} ${n}`).join(', ') || 'none'}; ${asks.length} asked.\n\n`]
  out.push('### Denies by reason\n\n')
  out.push(table(['Stage', 'Rule or category', 'Count'], count(denies, d => `${d.stage}\t${d.rule ?? d.category ?? d.model?.category ?? '?'}`).map(([k, n]) => [...k.split('\t'), n])))
  out.push('\n### Denied programs\n\n')
  out.push(table(['Program', 'Count'], count(denies, d => String(d.command ?? '').trim().split(/\s+/)[0]).slice(0, 15).map(([p, n]) => [`\`${cell(p)}\``, n])))
  const model = bash.filter(l => l.stage === 'model')
  out.push(`\n### Model stage\n\n${model.length} commands went to a model.\n\n`)
  out.push(table(['Source', 'Count', 'Avg ms', 'Below 0.8'], count(model, l => l.model?.source).map(([s, n]) => {
    const ms = model.filter(l => l.model?.source === s && typeof l.model.ms === 'number').map(l => l.model.ms)
    return [s, n, ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : '-', model.filter(l => l.model?.source === s && l.model.confidence < 0.8).length]
  })))
  out.push('\n### After a deny, the next Bash call in the same loop\n\n')
  out.push(table(['Next', 'Count'], afterDeny(bash)))
  const failed = bash.filter(l => l.decision === 'allow' && l.isError)
  out.push(`\n${failed.length} allowed commands (${pct(failed.length, bash.filter(l => l.decision === 'allow').length)}) then failed.\n`)
  return out.join('')
}

// --judge: skill descriptions from SKILL.md frontmatter, keyed by `plugin:skill` and bare `skill`.
export function skillDescriptions(roots: string[]): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (dir: string, depth: number) => {
    if (depth > 7 || !existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p, depth + 1)
      else if (e.name === 'SKILL.md') {
        const text = readFileSync(p, 'utf8').slice(0, 8000)
        const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
        const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim().replace(/^["']|["']$/g, '')
        const desc = /^description:\s*([\s\S]*?)(?=\n[A-Za-z-]+:|$)/m.exec(fm)?.[1]?.trim().replace(/^["'>|-]\s*|["']$/g, '').replace(/\s+/g, ' ')
        if (!name || !desc) continue
        const plugin = /\/([^/]+)\/(?:[^/]+\/)?skills\/[^/]+\/SKILL\.md$/.exec(p)?.[1]
        if (plugin) out.set(`${plugin}:${name}`, desc)
        if (!out.has(name)) out.set(name, desc)
      }
    }
  }
  for (const r of roots) walk(r, 0)
  return out
}

export const describe = (descs: Map<string, string>, name: string) => descs.get(name) ?? descs.get(name.split(':').pop()!)

export function judgePrompt(text: string, skills: [string, string][]): string {
  return `A user sent this prompt to an AI coding agent that can load skills (instructions for a kind of task) from the list below.
Which skills should the agent load to handle the prompt well? Only skills clearly relevant to the task, often none.

<prompt>
${text.replace(/<\/?prompt>/gi, '')}
</prompt>

Skills:
${skills.map(([n, d]) => `- ${n}: ${d.slice(0, 400)}`).join('\n')}

Answer only with JSON: {"skills": ["<exact skill name>", ...], "reason": "<one sentence>"}`
}

export function parseJudge(reply: string): string[] | null {
  const s = reply.indexOf('{')
  const e = reply.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try {
    const j = JSON.parse(reply.slice(s, e + 1))
    return Array.isArray(j.skills) ? j.skills.filter((x: unknown) => typeof x === 'string') : null
  } catch {
    return null
  }
}

function judgeSection(lines: Line[], limit: number, model: string): string {
  const descs = skillDescriptions([join(homedir(), '.claude/plugins/cache'), join(homedir(), '.claude/skills'), join(process.cwd(), '.claude/skills')])
  const prompts = lines.filter(l => l.kind === 'prompt' && typeof l.text === 'string' && l.text.trim() && !l.slash).slice(-limit)
  const rows: (string | number)[][] = []
  const missed = new Map<string, number>()
  const extra = new Map<string, number>()
  // The judge's own session must not log into the data it is judging.
  const quiet = mkdtempSync(join(tmpdir(), 'usage-report-'))
  try {
    for (const p of prompts) {
      // The listing logged with this prompt, or the last one before it in the session.
      const listing = lines.filter(l => l.kind === 'listing' && l.session === p.session && (l.prompt ?? 0) <= p.prompt).at(-1)
      const skills = candidates(listing, descs)
      if (skills.length === 0) continue
      const r = spawnSync('claude', ['-p', '--model', model], { input: judgePrompt(p.text, skills), encoding: 'utf8', timeout: 120_000, env: { ...process.env, CLAUDE_USAGE_LOG_DIR: quiet } })
      const should = r.status === 0 ? parseJudge(r.stdout) : null
      if (!should) {
        rows.push([cell(p.text), 'judge failed', '', ''])
        continue
      }
      const used = new Set(lines.filter(l => l.kind === 'skill' && l.session === p.session && l.prompt === p.prompt).map(l => l.skill))
      const m = should.filter(s => !used.has(s))
      const x = [...used].filter(s => !should.includes(s))
      for (const s of m) missed.set(s, (missed.get(s) ?? 0) + 1)
      for (const s of x) extra.set(s, (extra.get(s) ?? 0) + 1)
      rows.push([cell(p.text), [...used].join(', ') || '-', m.join(', ') || '-', x.join(', ') || '-'])
    }
  } finally {
    rmSync(quiet, { recursive: true, force: true })
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
  return [
    `## Judged routing (${model}, last ${prompts.length} prompts)\n\n`,
    'Missed: the judge says the skill fit, but it never loaded (its description may not trigger). Unneeded: it loaded but the judge says it did not fit (it may trigger too often).\n\n',
    table(['Skill', 'Missed'], sorted(missed)),
    '\n',
    table(['Skill', 'Unneeded'], sorted(extra)),
    '\n',
    table(['Prompt', 'Loaded', 'Missed', 'Unneeded'], rows),
  ].join('')
}

function main(argv: string[]) {
  const arg = (name: string) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log('Usage: usage-report.ts [--days N] [--dir PATH] [--judge [--limit N] [--model M]]')
    return
  }
  const days = Number(arg('--days') ?? 7)
  const dir = arg('--dir') ?? logDir()
  const lines = readLog(dir, Number.isFinite(days) && days > 0 ? days : 7)
  console.log(`# Usage report\n\n${lines.length} log lines from the last ${days} days in \`${dir}\`.\n`)
  console.log(skillSection(lines))
  console.log(agentSection(lines))
  console.log(bashSection(lines))
  if (argv.includes('--judge')) console.log(judgeSection(lines, Number(arg('--limit') ?? 20), arg('--model') ?? 'haiku'))
}

if (import.meta.main) main(process.argv.slice(2))
