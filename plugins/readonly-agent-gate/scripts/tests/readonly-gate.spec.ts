// bun test plugins/readonly-agent-gate/scripts/tests
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_AGENTS, DEFAULT_PLAN_WRITERS, isPlanWriter, isReadOnly, parseExtra } from '../agents.ts'
import { parsePlanDirs, projectRoot } from '../plans.ts'

describe('agents', () => {
  test('defaults gate the scoped and bare read-only agents only', () => {
    for (const t of ['architect', 'architect:architect', 'reviewer:reviewer', 'debugger:debugger', 'debugger',
      'security-auditor', 'security-auditor:security-auditor', 'open-source-release-audit',
      'open-source-release-audit:open-source-release-audit']) {
      expect(isReadOnly(t)).toBe(true)
    }
    for (const t of ['coder:coder', 'security:reviewer', 'reviewer:other', 'quick-review', 'Explore', '',
      'web-perf-auditor:web-perf-auditor', 'browser-tester:browser-tester', 'security:security-auditor']) {
      expect(isReadOnly(t)).toBe(false)
    }
    expect(DEFAULT_AGENTS.length).toBe(10)
  })

  test('a bare extra matches any plugin agent of that name, a scoped one only itself', () => {
    const extra = parseExtra('security-auditor, web:browser-tester')
    expect(isReadOnly('security-auditor', extra)).toBe(true)
    expect(isReadOnly('security-auditor:security-auditor', extra)).toBe(true)
    expect(isReadOnly('a:b:security-auditor', extra)).toBe(true)
    expect(isReadOnly('web:browser-tester', extra)).toBe(true)
    expect(isReadOnly('other:browser-tester', extra)).toBe(false)
    expect(isReadOnly('browser-tester', extra)).toBe(false)
  })

  test('parseExtra splits on commas and whitespace, reads a JSON list, drops invalid names', () => {
    expect(parseExtra(undefined)).toEqual([])
    expect(parseExtra('')).toEqual([])
    expect(parseExtra(' a ,b\tc\nd ')).toEqual(['a', 'b', 'c', 'd'])
    expect(parseExtra('["x", "y:z", 3]')).toEqual(['x', 'y:z'])
    expect(parseExtra('ok, $bad, a:, :b, ' + 'n'.repeat(200))).toEqual(['ok'])
  })

  test('an over-long option is refused whole, not cut', () => {
    expect(parseExtra(`${'a,'.repeat(2047)}ab`)).toEqual(Array(2047).fill('a').concat('ab'))   // 4096 chars
    expect(parseExtra(`${'a,'.repeat(2048)}dba`)).toBe(null)
  })

  test('only architect writes plans by default; plan_writers adds names like extra_agents', () => {
    expect(DEFAULT_PLAN_WRITERS).toEqual(['architect', 'architect:architect'])
    expect(isPlanWriter('architect')).toBe(true)
    expect(isPlanWriter('architect:architect')).toBe(true)
    for (const t of ['reviewer', 'reviewer:reviewer', 'debugger:debugger', 'security-auditor', 'other:architect', 'coder:coder']) {
      expect(isPlanWriter(t)).toBe(false)
    }
    const extra = parseExtra('reviewer, db:dba')
    expect(isPlanWriter('reviewer:reviewer', extra)).toBe(true)
    expect(isPlanWriter('db:dba', extra)).toBe(true)
    expect(isPlanWriter('other:dba', extra)).toBe(false)
    expect(isPlanWriter('debugger:debugger', extra)).toBe(false)
  })
})

describe('plan options', () => {
  test('plan_dirs defaults to docs/plans when unset or blank', () => {
    expect(parsePlanDirs(undefined)).toEqual(['docs/plans'])
    expect(parsePlanDirs('')).toEqual(['docs/plans'])
    expect(parsePlanDirs('  \n')).toEqual(['docs/plans'])
  })

  test('plan_dirs entries are normalized and bad ones ignored', () => {
    expect(parsePlanDirs(' notes/plans/ , ./design,design , rfcs//drafts')).toEqual(['notes/plans', 'design', 'rfcs/drafts'])
    expect(parsePlanDirs('["a", "b/c", 3, "/abs"]')).toEqual(['a', 'b/c'])
    expect(parsePlanDirs('/abs, ../up, a/../b, , ., ./, .git/x, .claude/agents, x/.Claude, ~/p, a\tb, good'))
      .toEqual(['good'])
    expect(parsePlanDirs('..')).toEqual([])
    expect(parsePlanDirs('x'.repeat(600))).toEqual([])
    expect(parsePlanDirs(Array.from({ length: 40 }, (_, i) => `d${i}`).join(',')).length).toBe(16)
    // Cutting this at 4096 would leave docs/plans; the whole value is refused instead.
    expect(parsePlanDirs(`${' '.repeat(4086)}docs/plans/private`)).toEqual([])
  })

  test('the project root is CLAUDE_PROJECT_DIR only', () => {
    expect(projectRoot('/home/u/proj')).toBe('/home/u/proj')
    expect(projectRoot('/home/u/proj/')).toBe('/home/u/proj')
    expect(projectRoot(undefined)).toBe(null)
    expect(projectRoot('')).toBe(null)
    expect(projectRoot('relative')).toBe(null)
    expect(projectRoot('/')).toBe(null)
    expect(projectRoot(`/${'x'.repeat(5000)}`)).toBe(null)
  })
})

const GATE = join(import.meta.dir, '..', 'readonly-gate.ts')
const SP = '/home/u/.claude/scratch/abc'

// The options and the project root are the hook's, never inherited from the shell running the
// spec. The root matches the payload cwd, as at the start of a session.
const BASE_ENV = {
  TMPDIR: '', CLAUDE_PROJECT_DIR: '/home/u/repo', CLAUDE_PLUGIN_OPTION_EXTRA_AGENTS: '',
  CLAUDE_PLUGIN_OPTION_PLAN_WRITERS: '', CLAUDE_PLUGIN_OPTION_PLAN_DIRS: '',
}

function gate(payload: Record<string, unknown>, env: Record<string, string> = {}): { code: number; err: string } {
  const r = Bun.spawnSync(['bun', '--no-env-file', '--config=/dev/null', GATE], {
    stdin: new TextEncoder().encode(JSON.stringify(payload)), stdout: 'pipe', stderr: 'pipe',
    env: { ...process.env, ...BASE_ENV, ...env },
  })
  return { code: r.exitCode ?? -1, err: r.stderr.toString() }
}

const ro = (tool_name: string, tool_input: unknown, extra: Record<string, unknown> = {}) =>
  gate({ agent_type: 'architect:architect', agent_id: 'a1', tool_name, tool_input, cwd: '/home/u/repo', scratchpad_dir: SP, ...extra })

describe('file tools', () => {
  test('scratch writes are allowed', () => {
    expect(ro('Write', { file_path: '/tmp/plan.md', content: 'x' }).code).toBe(0)
    expect(ro('Write', { file_path: `${SP}/notes.md`, content: 'x' }).code).toBe(0)
    expect(ro('Edit', { file_path: '/tmp/a/b.md' }).code).toBe(0)
    expect(ro('MultiEdit', { file_path: `${SP}/x.md` }).code).toBe(0)
    expect(ro('NotebookEdit', { notebook_path: '/tmp/n.ipynb' }).code).toBe(0)
  })

  test('repo and other paths are blocked', () => {
    for (const p of ['/home/u/repo/README.md', '/etc/passwd', '/tmpfoo/x', '/tmp/../home/x', `${SP}/../x`, `${SP}x/y`, '/tmp/../etc']) {
      const r = ro('Write', { file_path: p })
      expect(r.code).toBe(2)
      expect(r.err).toContain('read-only')
    }
    expect(ro('Edit', { file_path: '/home/u/repo/a.ts' }).code).toBe(2)
    expect(ro('MultiEdit', { file_path: '/home/u/repo/a.ts' }).code).toBe(2)
    expect(ro('NotebookEdit', { notebook_path: '/home/u/repo/n.ipynb' }).code).toBe(2)
  })

  test('relative paths resolve against the payload cwd', () => {
    expect(ro('Write', { file_path: 'plan.md' }).code).toBe(2)
    expect(ro('Write', { file_path: 'plan.md' }, { cwd: '/tmp/work' }).code).toBe(0)
    expect(ro('Write', { file_path: '../../etc/x' }, { cwd: '/tmp/work' }).code).toBe(2)
    expect(ro('Write', { file_path: 'plan.md' }, { cwd: undefined }).code).toBe(2)
  })

  test('odd path forms', () => {
    expect(ro('Write', { file_path: '~/.bashrc' }, { cwd: '/tmp/work' }).code).toBe(2)
    expect(ro('Write', { file_path: '//tmp/x' }).code).toBe(2)
    expect(ro('Write', { file_path: '/tmp/x\0y' }).code).toBe(2)
    expect(ro('Write', { file_path: '/tmp/dir/' }).code).toBe(0)
    expect(ro('Write', { file_path: '/home/u/repo/dir/' }).code).toBe(2)
  })

  test('TMPDIR is a scratch root only when deep enough', () => {
    const t = (tmp: string, file_path: string) => {
      const r = Bun.spawnSync(['bun', '--no-env-file', '--config=/dev/null', GATE], {
        stdin: new TextEncoder().encode(JSON.stringify({ agent_type: 'architect', agent_id: 'a1', tool_name: 'Write', tool_input: { file_path }, cwd: '/home/u/repo' })),
        stdout: 'pipe', stderr: 'pipe', env: { ...process.env, TMPDIR: tmp },
      })
      return r.exitCode
    }
    expect(t('/var/scratch/t', '/var/scratch/t/a.md')).toBe(0)
    expect(t('/var/scratch/t', '/var/scratch/other/a.md')).toBe(2)
    expect(t('/home', '/home/x')).toBe(2)
    expect(t('/', '/etc/x')).toBe(2)
  })

  test('NotebookEdit needs notebook_path, others file_path', () => {
    expect(ro('NotebookEdit', { file_path: '/tmp/n.ipynb' }).code).toBe(2)
    expect(ro('Write', { notebook_path: '/tmp/n' }).code).toBe(2)
  })

  test('missing or non-string path is blocked', () => {
    expect(ro('Write', {}).code).toBe(2)
    expect(ro('Write', { file_path: 5 }).code).toBe(2)
    expect(ro('Write', { file_path: '' }).code).toBe(2)
    expect(ro('Write', null).code).toBe(2)
  })

  test('other tools reaching a read-only agent are blocked', () => {
    expect(ro('Read', { file_path: '/tmp/x' }).code).toBe(2)
    expect(ro('Bogus', { file_path: '/tmp/x' }).code).toBe(2)
    expect(ro('toString', { file_path: '/tmp/x' }).code).toBe(2)
    expect(gate({ agent_type: 'architect', tool_input: { file_path: '/tmp/x' } }).code).toBe(2)
  })

  test('Bash still goes through the Bash check', () => {
    expect(ro('Bash', { command: 'git log' }).code).toBe(0)
    expect(ro('Bash', { command: 'rm -rf src' }).code).toBe(2)
  })

  test('other agents and the main thread pass', () => {
    expect(gate({ agent_type: 'coder:coder', agent_id: 'a2', tool_name: 'Write', tool_input: { file_path: '/home/u/repo/x' } }).code).toBe(0)
    expect(gate({ tool_name: 'Write', tool_input: { file_path: '/home/u/repo/x' } }).code).toBe(0)
  })
})

// Plan files under a project root that does not exist: missing parts resolve lexically, so these
// cases need no filesystem. The root is CLAUDE_PROJECT_DIR (BASE_ENV sets it to R).
const as = (agent_type: string, tool_name: string, tool_input: unknown, env: Record<string, string> = {}, extra: Record<string, unknown> = {}) =>
  gate({ agent_type, agent_id: 'a1', tool_name, tool_input, cwd: '/home/u/repo', scratchpad_dir: SP, ...extra }, env)

describe('plan files', () => {
  const R = '/home/u/repo'

  test('architect may write a new plan file, nested or not, with Write, Edit and MultiEdit', () => {
    for (const file_path of [`${R}/docs/plans/a.md`, 'docs/plans/a.md', `${R}/docs/plans/sub/deep/b.md`, './docs/plans/c.md', `${R}/docs/plans//d.md`]) {
      expect(ro('Write', { file_path, content: 'x' }).code).toBe(0)
    }
    expect(ro('Edit', { file_path: `${R}/docs/plans/a.md` }).code).toBe(0)
    expect(ro('MultiEdit', { file_path: `${R}/docs/plans/a.md` }).code).toBe(0)
    expect(as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }).code).toBe(0)
  })

  test('NotebookEdit and Bash get no plan allowance', () => {
    expect(ro('NotebookEdit', { notebook_path: `${R}/docs/plans/a.md` }).code).toBe(2)
    for (const command of ['echo x > docs/plans/a.md', 'tee docs/plans/a.md < /tmp/x', 'cp /tmp/a.md docs/plans/a.md', 'mkdir -p docs/plans/x']) {
      const r = ro('Bash', { command })
      expect(r.code).toBe(2)
      expect(r.err).toContain(`To save a plan, use Write or Edit on a .md file under ${R}/docs/plans/;`)
    }
  })

  test('non-.md files, other repo paths and escapes are blocked', () => {
    for (const file_path of [`${R}/docs/plans/a.txt`, `${R}/docs/plans/a.md.sh`, `${R}/docs/plans/.md`, `${R}/docs/plans/a.MD`,
      `${R}/docs/plans/`, `${R}/docs/plans/sub.md/`, `${R}/docs/plans`, `${R}/README.md`, `${R}/docs/a.md`, `${R}/docs/plansx/a.md`,
      'docs/plans/../a.md', 'docs/plans/../../x.md', `${R}/docs/plans/../../../etc/x.md`, 'docs/plans/missing/../../a.md',
      `${R}/docs/plans/CLAUDE.md`, `${R}/docs/plans/sub/agents.md`, `${R}/docs/plans/claude.local.md`, '/home/u/other/docs/plans/a.md']) {
      const r = ro('Write', { file_path })
      expect(r.code).toBe(2)
      expect(r.err).toContain('read-only apart from plans')
      expect(r.err).toContain('docs/plans/')
    }
    expect(ro('Write', { file_path: '~/docs/plans/a.md' }).code).toBe(2)
  })

  test('the other read-only agents are still blocked from the plan directory', () => {
    for (const t of ['reviewer', 'reviewer:reviewer', 'debugger:debugger', 'security-auditor:security-auditor', 'open-source-release-audit']) {
      const r = as(t, 'Write', { file_path: `${R}/docs/plans/a.md` })
      expect(r.code).toBe(2)
      expect(r.err).not.toContain('apart from plans')
      expect(as(t, 'Bash', { command: 'echo x > docs/plans/a.md' }).err).not.toContain('To save a plan')
    }
  })

  test('CLAUDE_PROJECT_DIR sets the root, and without it there is no plan allowance', () => {
    const env = { CLAUDE_PROJECT_DIR: R }
    expect(as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }, env, { cwd: '/home/u/elsewhere' }).code).toBe(0)
    expect(as('architect', 'Write', { file_path: '/home/u/elsewhere/docs/plans/a.md' }, env, { cwd: '/home/u/elsewhere' }).code).toBe(2)
    expect(as('architect', 'Write', { file_path: 'a.md' }, env, { cwd: `${R}/docs/plans` }).code).toBe(0)
    expect(as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }, { CLAUDE_PROJECT_DIR: 'repo' }).code).toBe(2)
    expect(as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }, { CLAUDE_PROJECT_DIR: '/' }).code).toBe(2)
    expect(as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }, {}, { cwd: undefined }).code).toBe(0)
    const unset = as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }, { CLAUDE_PROJECT_DIR: '' })
    expect(unset.code).toBe(2)
    expect(unset.err).toContain('CLAUDE_PROJECT_DIR is not set')
    expect(as('architect', 'Write', { file_path: 'docs/plans/a.md' }, { CLAUDE_PROJECT_DIR: '' }).code).toBe(2)
  })

  test('dot-directories, dotfiles and instruction files below the plan directory are blocked', () => {
    for (const rel of ['.claude/skills/x/SKILL.md', '.claude/rules/x.md', '.claude/commands/x.md', '.claude/agents/x.md',
      '.CLAUDE/x.md', '.git/x.md', '.github/copilot-instructions.md', '.agents/x.md', '.cursor/rules/x.md',
      'sub/.claude/agents/x.md', '.hidden.md', 'sub/.x/a.md', 'CLAUDE.md', 'sub/Agents.md']) {
      const r = ro('Write', { file_path: `${R}/docs/plans/${rel}` })
      expect(r.code).toBe(2)
      expect(r.err).toContain('read-only apart from plans')
      expect(ro('Edit', { file_path: `docs/plans/${rel}` }).code).toBe(2)
    }
    // A dot-directory above the plan directory, in a configured entry, is fine.
    const env = { CLAUDE_PLUGIN_OPTION_PLAN_DIRS: '.agents/plans' }
    expect(as('architect', 'Write', { file_path: `${R}/.agents/plans/a.md` }, env).code).toBe(0)
    expect(as('architect', 'Write', { file_path: `${R}/.agents/plans/.claude/a.md` }, env).code).toBe(2)
  })

  test('over-long options are refused whole', () => {
    const longDirs = { CLAUDE_PLUGIN_OPTION_PLAN_DIRS: `${' '.repeat(4086)}docs/plans/private` }
    const r = as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }, longDirs)
    expect(r.code).toBe(2)
    expect(r.err).toContain('no plan directories')
    const longWriters = { CLAUDE_PLUGIN_OPTION_PLAN_WRITERS: `${'a,'.repeat(2048)}reviewer` }
    expect(as('reviewer:reviewer', 'Write', { file_path: `${R}/docs/plans/a.md` }, longWriters).code).toBe(2)
    expect(as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }, longWriters).code).toBe(0)
    const longExtra = { CLAUDE_PLUGIN_OPTION_EXTRA_AGENTS: `${'a,'.repeat(2048)}dba` }
    const blocked = as('coder:coder', 'Write', { file_path: `${R}/src/a.ts` }, longExtra)
    expect(blocked.code).toBe(2)
    expect(blocked.err).toContain('extra_agents option is longer')
    expect(gate({ tool_name: 'Write', tool_input: { file_path: `${R}/src/a.ts` } }, longExtra).code).toBe(0)   // main thread
  })

  test('custom plan_dirs replace the default, and bad entries are ignored', () => {
    const env = { CLAUDE_PLUGIN_OPTION_PLAN_DIRS: 'notes/plans, design' }
    expect(as('architect', 'Write', { file_path: `${R}/notes/plans/a.md` }, env).code).toBe(0)
    expect(as('architect', 'Write', { file_path: `${R}/design/x/a.md` }, env).code).toBe(0)
    const r = as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain(`under ${R}/notes/plans/, ${R}/design/ (`)
    expect(as('architect', 'Write', { file_path: `${R}/rfcs/a.md` }, { CLAUDE_PLUGIN_OPTION_PLAN_DIRS: '["rfcs"]' }).code).toBe(0)
    const bad = { CLAUDE_PLUGIN_OPTION_PLAN_DIRS: `${R}/abs, ../up, a/../b, , ., .claude/agents, ~/p, good` }
    for (const file_path of [`${R}/abs/a.md`, `${R}${R}/abs/a.md`, '/home/u/up/a.md', `${R}/b/a.md`, `${R}/a/b/a.md`, `${R}/a.md`,
      `${R}/.claude/agents/a.md`, `${R}/~/p/a.md`, `${R}/docs/plans/a.md`]) {
      expect(as('architect', 'Write', { file_path }, bad).code).toBe(2)
    }
    expect(as('architect', 'Write', { file_path: `${R}/good/a.md` }, bad).code).toBe(0)
    const none = as('architect', 'Write', { file_path: `${R}/docs/plans/a.md` }, { CLAUDE_PLUGIN_OPTION_PLAN_DIRS: '../x' })
    expect(none.code).toBe(2)
    expect(none.err).toContain('no plan directories')
  })

  test('plan_writers adds read-only agents; others stay blocked', () => {
    const env = { CLAUDE_PLUGIN_OPTION_PLAN_WRITERS: 'reviewer, db:dba', CLAUDE_PLUGIN_OPTION_EXTRA_AGENTS: 'db:dba' }
    expect(as('reviewer:reviewer', 'Write', { file_path: `${R}/docs/plans/a.md` }, env).code).toBe(0)
    expect(as('db:dba', 'Write', { file_path: `${R}/docs/plans/a.md` }, env).code).toBe(0)
    expect(as('db:dba', 'Write', { file_path: `${R}/src/a.md` }, env).code).toBe(2)
    expect(as('debugger:debugger', 'Write', { file_path: `${R}/docs/plans/a.md` }, env).code).toBe(2)
    expect(as('reviewer:reviewer', 'Bash', { command: 'echo x > docs/plans/a.md' }, env).code).toBe(2)
  })
})

// Plan files in a real project. It sits in this checkout, outside every scratch root (unless the
// checkout is under /tmp), so only the plan rule can allow a write there.
describe('plan files on the filesystem', () => {
  const repoFile = join(import.meta.dir, '..', 'scratch.ts')
  let p = ''        // the project
  let out = ''      // a directory outside it
  let pLink = ''    // a symlink to the project
  let pOut = ''     // a project whose docs/plans is a symlink out of it
  let pIn = ''      // a project whose docs/plans is a symlink to another of its directories
  let wtLink = ''   // a symlink to a worktree of p
  const w = (root: string, file_path: string, tool = 'Write', cwd = root) =>
    as('architect:architect', tool, { file_path }, { CLAUDE_PROJECT_DIR: root }, { cwd })
  beforeAll(() => {
    p = mkdtempSync(join(import.meta.dir, 'plan-project-'))
    out = mkdtempSync(join(import.meta.dir, 'plan-outside-'))
    pOut = mkdtempSync(join(import.meta.dir, 'plan-symdir-'))
    pIn = mkdtempSync(join(import.meta.dir, 'plan-indir-'))
    pLink = `${p}-link`
    symlinkSync(p, pLink)
    mkdirSync(`${p}/docs/plans/sub`, { recursive: true })
    mkdirSync(`${p}/src`)
    writeFileSync(`${p}/README.md`, 'x')
    writeFileSync(`${p}/docs/plans/existing.md`, 'x')
    writeFileSync(`${p}/docs/plans/notes.txt`, 'x')
    writeFileSync(`${out}/target.md`, 'x')
    symlinkSync(`${p}/README.md`, `${p}/docs/plans/readme.md`)
    symlinkSync(repoFile, `${p}/docs/plans/repo.md`)
    symlinkSync(`${out}/target.md`, `${p}/docs/plans/outside.md`)
    symlinkSync('existing.md', `${p}/docs/plans/inner.md`)
    symlinkSync('notes.txt', `${p}/docs/plans/txt.md`)
    symlinkSync(`${p}/src/new.md`, `${p}/docs/plans/dangling.md`)
    symlinkSync(`${p}/src`, `${p}/docs/plans/srclink`)
    linkSync(`${p}/README.md`, `${p}/docs/plans/hard.md`)
    mkdirSync(`${pOut}/docs`)
    symlinkSync(out, `${pOut}/docs/plans`)
    mkdirSync(`${pIn}/docs`)
    mkdirSync(`${pIn}/notes`)
    symlinkSync(`${pIn}/notes`, `${pIn}/docs/plans`)
    symlinkSync('sub', `${p}/docs/plans/.claude`)   // a dot name for a plain directory
    mkdirSync(`${p}/docs/plans/sub/.config/agents`, { recursive: true })
    symlinkSync('sub/.config', `${p}/docs/plans/cfg`)   // a plain name for a dot-directory
    // Worktrees the way git lays them out: <wt>/.git names <root>/.git/worktrees/<name>, whose
    // gitdir file names <wt>/.git back.
    const worktree = (name: string, pointer: string, back: string | null) => {
      const dir = `${p}/.claude/worktrees/${name}`
      mkdirSync(`${dir}/docs/plans/sub`, { recursive: true })
      mkdirSync(`${dir}/src`, { recursive: true })
      writeFileSync(`${dir}/.git`, `gitdir: ${pointer}\n`)
      if (back !== null) {
        mkdirSync(`${p}/.git/worktrees/${name}`, { recursive: true })
        writeFileSync(`${p}/.git/worktrees/${name}/gitdir`, `${back}\n`)
      }
      return dir
    }
    const wt = worktree('wt', `${p}/.git/worktrees/wt`, `${p}/.claude/worktrees/wt/.git`)
    worktree('rel', '../../../.git/worktrees/rel', '../../../.claude/worktrees/rel/.git')
    worktree('fake', `${p}/.git/worktrees/wt`, null)   // claims wt's entry, which points back at wt
    mkdirSync(`${out}/.git/worktrees/foreign`, { recursive: true })
    worktree('foreign', `${out}/.git/worktrees/foreign`, null)
    writeFileSync(`${out}/.git/worktrees/foreign/gitdir`, `${p}/.claude/worktrees/foreign/.git\n`)
    worktree('nogit', `${p}/.git/worktrees/nogit`, null)   // no entry in the repo
    const linked = worktree('linked', `${p}/.git/worktrees/linked`, `${p}/.claude/worktrees/linked/.git`)
    rmSync(`${linked}/.git`)
    symlinkSync(`${wt}/.git`, `${linked}/.git`)   // a .git symlink is not a worktree file
    wtLink = `${p}-wtlink`
    symlinkSync(wt, wtLink)
  })
  afterAll(() => {
    for (const d of [p, out, pOut, pIn, pLink, wtLink]) rmSync(d, { recursive: true, force: true })
  })

  test('new and existing plan files pass, nested or through a link that stays inside', () => {
    expect(w(p, `${p}/docs/plans/new.md`).code).toBe(0)
    expect(w(p, `${p}/docs/plans/existing.md`).code).toBe(0)
    expect(w(p, `${p}/docs/plans/existing.md`, 'Edit').code).toBe(0)
    expect(w(p, `${p}/docs/plans/existing.md`, 'MultiEdit').code).toBe(0)
    expect(w(p, `${p}/docs/plans/sub/new.md`).code).toBe(0)
    expect(w(p, `${p}/docs/plans/sub/newdir/new.md`).code).toBe(0)
    expect(w(p, `${p}/docs/plans/sub/../new.md`).code).toBe(0)
    expect(w(p, `${p}/docs/plans/inner.md`).code).toBe(0)
    expect(w(p, 'docs/plans/new.md').code).toBe(0)
    expect(w(p, '../docs/plans/new.md', 'Write', `${p}/src`).code).toBe(0)
  })

  test('a project root that is itself a symlink works by either of its paths', () => {
    expect(w(pLink, `${pLink}/docs/plans/new.md`).code).toBe(0)
    expect(w(pLink, `${p}/docs/plans/new.md`).code).toBe(0)
    // An alias the root does not name hides what lies above the target, so it is not used.
    expect(w(p, `${pLink}/docs/plans/new.md`).code).toBe(2)
  })

  test('a link to or through a dot-directory inside the plan directory is blocked', () => {
    const r = w(p, `${p}/docs/plans/cfg/agents/x.md`)   // cfg -> sub/.config
    expect(r.code).toBe(2)
    expect(r.err).toContain('dot-directory')
    expect(w(p, `${p}/docs/plans/.claude/x.md`).code).toBe(2)   // .claude -> sub, a plain directory
    expect(w(p, `${p}/docs/plans/sub/x.md`).code).toBe(0)
  })

  test('a git worktree of the project holding cwd is a second root', () => {
    const wt = `${p}/.claude/worktrees/wt`
    const env = { CLAUDE_PROJECT_DIR: p }
    const at = (file_path: string, cwd: string, e: Record<string, string> = env) =>
      as('architect:architect', 'Write', { file_path }, e, { cwd })
    expect(at(`${wt}/docs/plans/a.md`, wt).code).toBe(0)
    expect(at('docs/plans/a.md', wt).code).toBe(0)
    expect(at(`${wt}/docs/plans/sub/a.md`, `${wt}/src`).code).toBe(0)
    expect(at(`${p}/docs/plans/a.md`, wt).code).toBe(0)
    expect(at(`${wtLink}/docs/plans/a.md`, wtLink).code).toBe(0)   // cwd through a symlink
    expect(at(`${p}/.claude/worktrees/rel/docs/plans/a.md`, `${p}/.claude/worktrees/rel`).code).toBe(0)   // relative pointers
    const r = at(`${wt}/README.md`, wt)
    expect(r.code).toBe(2)
    expect(r.err).toContain(`under ${p}/docs/plans/, ${wt}/docs/plans/ (`)
    expect(at(`${wt}/docs/plans/.claude/x.md`, wt).code).toBe(2)
    // Without the cwd in it, or without the env root, the worktree is not a root.
    expect(at(`${wt}/docs/plans/a.md`, p).code).toBe(2)
    expect(at(`${wt}/docs/plans/a.md`, wt, { CLAUDE_PROJECT_DIR: '' }).code).toBe(2)
    expect(at(`${wt}/docs/plans/a.md`, wt, { CLAUDE_PROJECT_DIR: out }).code).toBe(2)
  })

  test('a .git file that is not a registered worktree of the project adds no root', () => {
    const env = { CLAUDE_PROJECT_DIR: p }
    for (const dir of [`${p}/.claude/worktrees/fake`, `${p}/.claude/worktrees/foreign`, `${p}/.claude/worktrees/nogit`, `${p}/.claude/worktrees/linked`]) {
      const r = as('architect:architect', 'Write', { file_path: `${dir}/docs/plans/a.md` }, env, { cwd: dir })
      expect(r.code).toBe(2)
      expect(r.err).toContain(`under ${p}/docs/plans/ (`)   // the env root's plan directory only
    }
  })

  test('a plan file that is a symlink or hard link out of the plan directory is blocked', () => {
    for (const name of ['readme.md', 'repo.md', 'outside.md', 'dangling.md']) {
      const r = w(p, `${p}/docs/plans/${name}`)
      expect(r.code).toBe(2)
      expect(r.err).toContain('resolves to')
      expect(w(p, `${p}/docs/plans/${name}`, 'Edit').code).toBe(2)
    }
    expect(w(p, `${p}/docs/plans/txt.md`).err).toContain('not a .md file')
    expect(w(p, `${p}/docs/plans/txt.md`).code).toBe(2)
    const hard = w(p, `${p}/docs/plans/hard.md`)
    expect(hard.code).toBe(2)
    expect(hard.err).toContain('hard link')
  })

  test('.. through a symlinked directory, or after a missing part, is blocked', () => {
    expect(w(p, `${p}/docs/plans/srclink/new.md`).code).toBe(2)
    expect(w(p, `${p}/docs/plans/srclink/../new.md`).code).toBe(2)   // the kernel lands in the project root
    expect(w(p, `${p}/docs/plans/missing/../new.md`).code).toBe(2)
    expect(w(p, `${p}/docs/plans/notes.txt/../new.md`).code).toBe(2)
    expect(w(p, `${p}/docs/plans/../../README.md`).code).toBe(2)
  })

  test('a symlinked plan directory is not used', () => {
    const r = w(pOut, `${pOut}/docs/plans/a.md`)
    expect(r.code).toBe(2)
    expect(r.err).toContain('symlink')
    expect(w(pOut, `${out}/a.md`).code).toBe(2)
    expect(w(pIn, `${pIn}/docs/plans/a.md`).code).toBe(2)
    expect(w(pIn, `${pIn}/notes/a.md`).code).toBe(2)
  })

  test('the other read-only agents are blocked from a real plan directory', () => {
    const r = as('reviewer:reviewer', 'Write', { file_path: `${p}/docs/plans/new.md` }, { CLAUDE_PROJECT_DIR: p }, { cwd: p })
    expect(r.code).toBe(2)
    expect(as('debugger', 'Edit', { file_path: `${p}/docs/plans/existing.md` }, { CLAUDE_PROJECT_DIR: p }, { cwd: p }).code).toBe(2)
  })
})

// Links pre-created in a scratch directory. The repo targets are this checkout's own files, which
// sit outside every scratch root unless the checkout is under /tmp. /tmp is usually its own
// filesystem, so the hard link joins two scratch files: the rule refuses any file with nlink > 1.
describe('links on the filesystem', () => {
  const repo = join(import.meta.dir, '..')
  const repoFile = join(repo, 'scratch.ts')
  let d = ''
  let d2 = ''   // a second scratch dir, outside d
  beforeAll(() => {
    d = mkdtempSync('/tmp/readonly-gate-spec-')
    d2 = mkdtempSync('/tmp/readonly-gate-spec2-')
    mkdirSync(`${d2}/deeper`)
    symlinkSync(`${d2}/deeper`, `${d}/inlink`)
    symlinkSync(repoFile, `${d}/link`)
    symlinkSync(repo, `${d}/dirlink`)
    symlinkSync(join(repo, 'not-there-yet.ts'), `${d}/dangling`)
    symlinkSync('sub/inner', `${d}/rel`)   // relative, resolves from the link's directory
    mkdirSync(`${d}/sub`)
    writeFileSync(`${d}/sub/inner`, '')
    symlinkSync(`${d}/sub/inner`, `${d}/scratchlink`)
    writeFileSync(`${d}/orig`, 'x')
    linkSync(`${d}/orig`, `${d}/hard`)
    writeFileSync(`${d}/plain`, 'x')
  })
  afterAll(() => {
    rmSync(d, { recursive: true, force: true })
    rmSync(d2, { recursive: true, force: true })
  })

  test('Write and Edit through a symlink to a repo file are blocked', () => {
    const r = ro('Write', { file_path: `${d}/link`, content: 'x' })
    expect(r.code).toBe(2)
    expect(r.err).toContain('resolves to')
    expect(ro('Edit', { file_path: `${d}/link` }).code).toBe(2)
    expect(ro('Write', { file_path: 'link' }, { cwd: d }).code).toBe(2)
  })

  test('Bash redirects and file commands through the symlink are blocked', () => {
    for (const command of [`printf x > ${d}/link`, `cp a ${d}/link`, `echo x >> ${d}/link`, `cat f | tee ${d}/link`,
      `touch ${d}/link`, `chmod +x ${d}/link`, `mkdir -p ${d}/dirlink/new`, `dd if=f of=${d}/link`]) {
      expect(ro('Bash', { command }).code).toBe(2)
    }
  })

  test('a pre-created hard link is blocked for Write and Bash', () => {
    const r = ro('Write', { file_path: `${d}/hard` })
    expect(r.code).toBe(2)
    expect(r.err).toContain('hard link')
    expect(ro('Bash', { command: `printf x > ${d}/hard` }).code).toBe(2)
    expect(ro('Bash', { command: `cp a ${d}/hard` }).code).toBe(2)
  })

  test('a dangling symlink and .. after a symlinked directory resolve outside', () => {
    expect(ro('Write', { file_path: `${d}/dangling` }).code).toBe(2)
    expect(ro('Bash', { command: `echo x > ${d}/dangling` }).code).toBe(2)
    expect(ro('Write', { file_path: `${d}/dirlink/../README.md` }).code).toBe(2)
    expect(ro('Write', { file_path: `${d}/dirlink/new.ts` }).code).toBe(2)
  })

  test('.. after a missing or non-directory part is blocked', () => {
    for (const file_path of [`${d}/nope/../link`, `${d}/plain/../link`, `${d}/nope/../dirlink/x`, `${d}/nope/x/../../link`]) {
      const r = ro('Write', { file_path })
      expect(r.code).toBe(2)
      expect(ro('Edit', { file_path }).code).toBe(2)
    }
    expect(ro('Write', { file_path: 'nope/../link' }, { cwd: d }).code).toBe(2)
    expect(ro('Bash', { command: `mkdir -p ${d}/nope && printf x > ${d}/nope/../link` }).code).toBe(2)
  })

  test('a file tool path must stay in scratch both as the kernel and as a normalizing writer read it', () => {
    // The kernel reads inlink/.. as d2, so the shell writes d2/link; a writer that normalizes the
    // path first writes d/link, which is the link to the repo file.
    const r = ro('Write', { file_path: `${d}/inlink/../link` })
    expect(r.code).toBe(2)
    expect(r.err).toContain('resolves to')
    expect(ro('Edit', { file_path: `${d}/inlink/../link` }).code).toBe(2)
    expect(ro('Bash', { command: `printf x > ${d}/inlink/../link` }).code).toBe(0)
    expect(ro('Write', { file_path: `${d}/inlink/../new.txt` }).code).toBe(0)
  })

  test('links that stay inside scratch, plain files and new paths pass', () => {
    expect(ro('Write', { file_path: `${d}/scratchlink` }).code).toBe(0)
    expect(ro('Write', { file_path: `${d}/rel` }).code).toBe(0)
    expect(ro('Write', { file_path: `${d}/plain` }).code).toBe(0)
    expect(ro('Write', { file_path: `${d}/new.txt` }).code).toBe(0)
    expect(ro('Write', { file_path: `${d}/newdir/x` }).code).toBe(0)   // a missing parent
    expect(ro('Write', { file_path: '/tmp/new.txt' }).code).toBe(0)
    expect(ro('Write', { file_path: '/tmp/newdir/x' }).code).toBe(0)
    expect(ro('Write', { file_path: `${d}/sub/../new2.txt` }).code).toBe(0)
    expect(ro('Bash', { command: `printf x > ${d}/plain && cp a ${d}/sub/` }).code).toBe(0)
    expect(ro('Bash', { command: `mkdir -p ${d}/newdir/a/b` }).code).toBe(0)
  })

  test('ln and cp -s/-l block a source that resolves outside scratch', () => {
    for (const command of [`ln -s ${d}/link ${d}/l2`, `ln -s ${repoFile} ${d}/l3`, `ln src/a.ts ${d}/h2`,
      `ln -s ../../..${repo}/scratch.ts ${d}/sub/l4`, `cp -s ${repoFile} ${d}/l5`, `cp -l src/a.ts ${d}/l6`,
      `link src/a.ts ${d}/l7`, `ln -sr src/a.ts ${d}/l8`, `ln -s ../dirlink/scratch.ts ${d}/sub/l9`]) {
      expect(ro('Bash', { command }).code).toBe(2)
    }
    for (const command of [`ln -s plain ${d}/l10`, `ln -s ${d}/plain ${d}/l11`, `ln ${d}/plain ${d}/l12`,
      `ln -s inner ${d}/sub/l13`, `ln -s ../plain ${d}/sub/`, `ln -s src/a /tmp/readonly-gate-spec-no-such-dir/x`]) {
      expect(ro('Bash', { command }).code).toBe(0)
    }
  })
})

describe('gate', () => {
  test('every allow/block case in readonly-bash.cases.sh passes', () => {
    const r = Bun.spawnSync(['bash', join(import.meta.dir, 'readonly-bash.cases.sh')], { stdout: 'pipe', stderr: 'pipe' })
    const out = `${r.stdout.toString()}${r.stderr.toString()}`
    if (r.exitCode !== 0) console.error(out)
    expect(out).toMatch(/\d+ passed, 0 failed/)
    expect(r.exitCode).toBe(0)
  }, 120_000)
})
