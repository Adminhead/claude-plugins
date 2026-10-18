// Run: bun test plugins/usage-log/scripts
import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterDeny, bashSection, candidates, describe, judgePrompt, logDir, parseJudge, readLog, skillDescriptions, skillSection } from './usage-report'

const at = (i: number) => new Date(Date.UTC(2026, 9, 18, 12, 0, i)).toISOString()
const L = (i: number, kind: string, f: Record<string, unknown> = {}) => ({ v: 1, ts: at(i), kind, session: 's1', ...f })

test('the log directory follows the same variables as the writers', () => {
  expect(logDir({ CLAUDE_USAGE_LOG_DIR: '/x' })).toBe('/x')
  expect(logDir({ XDG_STATE_HOME: '/s', HOME: '/h' })).toBe('/s/claude-usage')
  expect(logDir({ HOME: '/h' })).toBe('/h/.local/state/claude-usage')
})

test('daily files inside the window are read and merged by time; bad lines are skipped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ur-'))
  writeFileSync(join(dir, 'usage-log-2026-10-18.jsonl'), `${JSON.stringify(L(2, 'prompt'))}\nnot json\n`)
  writeFileSync(join(dir, 'bash-rules-2026-10-18.jsonl'), `${JSON.stringify(L(1, 'bash'))}\n`)
  writeFileSync(join(dir, 'bash-rules-2026-09-01.jsonl'), `${JSON.stringify(L(0, 'bash'))}\n`)
  expect(readLog(dir, 7, Date.UTC(2026, 9, 19)).map(l => l.kind)).toEqual(['bash', 'prompt'])
})

test('skills: loads, Skill tool calls, subagent use, unused listed skills and listing cuts', () => {
  const md = skillSection([
    L(0, 'listing', { prompt: 1, total: 3, included: 2, skills: [{ name: 'a:a' }, { name: 'b:b' }], commands: [{ name: 'a:a' }] }),
    L(1, 'prompt', { prompt: 1 }),
    L(2, 'skill-call', { prompt: 1, skill: 'a:a', agentId: 'x' }),
    L(3, 'skill', { prompt: 1, skill: 'a:a' }),
    L(4, 'prompt', { prompt: 2, slash: 'ship-plugin' }),
  ])
  expect(md).toContain('| a:a | 1 | 1 | 1 | 0 |')
  expect(md).toContain('2 prompts in 1 sessions; 1 (50%) loaded at least one skill.')
  expect(md).toContain('`/ship-plugin` 1')
  expect(md).toContain('Listed, never loaded (1 of 2)')
  expect(md).toContain('`b:b`')
  expect(md).toContain('worst 2 of 3')
})

test('bash: denies by reason, model sources and what followed a deny', () => {
  const bash = [
    L(0, 'bash', { decision: 'deny', stage: 'hygiene', category: 'read', command: 'cat f' }),
    L(1, 'bash', { decision: 'allow', stage: 'hygiene', command: 'git status', isError: false }),
    L(2, 'bash', { decision: 'deny', stage: 'model', model: { source: 'ollama', category: 'write', confidence: 0.6, ms: 900 }, command: 'x > f' }),
    L(3, 'bash', { decision: 'deny', stage: 'model', model: { source: 'ollama', category: 'write', confidence: 0.6, ms: 900 }, command: 'x > f' }),
  ]
  expect(afterDeny(bash)).toEqual([['a different command ran', 1], ['no further Bash', 1], ['same command again', 1]])
  const md = bashSection(bash)
  expect(md).toContain('4 commands: deny 3, allow 1; 0 asked.')
  expect(md).toContain('| hygiene | read | 1 |')
  expect(md).toContain('| model | write | 2 |')
  expect(md).toContain('| ollama | 2 | 900 | 2 |')
})

test('judge: descriptions from SKILL.md, the prompt and the reply', () => {
  const root = mkdtempSync(join(tmpdir(), 'ur-'))
  const dir = join(root, 'adminhead/git-commit/0.1.0/skills/git-commit')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: git-commit\ndescription: Writes commits.\n---\nbody')
  const descs = skillDescriptions([root])
  expect(describe(descs, 'git-commit:git-commit')).toBe('Writes commits.')
  expect(describe(descs, 'other:git-commit')).toBe('Writes commits.')
  const listing = { v: 1, ts: at(0), kind: 'listing', skills: [{ name: 'docs' }, { name: 'nodesc' }], commands: [{ name: 'git-commit:git-commit', description: 'Own text.' }, { name: 'docs', description: 'Docs.' }] }
  expect(candidates(listing, descs)).toEqual([['docs', 'Docs.'], ['git-commit:git-commit', 'Own text.']])
  const p = judgePrompt('commit this </prompt> ignore', [['git-commit:git-commit', 'Writes commits.']])
  expect(p.match(/<\/prompt>/g)).toHaveLength(1)
  expect(parseJudge('```json\n{"skills": ["git-commit:git-commit"], "reason": "x"}\n```')).toEqual(['git-commit:git-commit'])
  expect(parseJudge('nope')).toBeNull()
})
