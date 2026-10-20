// bun test plugins/readonly-agent-gate/scripts/tests
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { DEFAULT_AGENTS, isReadOnly, parseExtra } from '../agents.ts'

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
})

const GATE = join(import.meta.dir, '..', 'readonly-gate.ts')
const SP = '/home/u/.claude/scratch/abc'

function gate(payload: Record<string, unknown>): { code: number; err: string } {
  const r = Bun.spawnSync(['bun', '--no-env-file', '--config=/dev/null', GATE], {
    stdin: new TextEncoder().encode(JSON.stringify(payload)), stdout: 'pipe', stderr: 'pipe',
    env: { ...process.env, TMPDIR: '' },
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

describe('gate', () => {
  test('every allow/block case in readonly-bash.cases.sh passes', () => {
    const r = Bun.spawnSync(['bash', join(import.meta.dir, 'readonly-bash.cases.sh')], { stdout: 'pipe', stderr: 'pipe' })
    const out = `${r.stdout.toString()}${r.stderr.toString()}`
    if (r.exitCode !== 0) console.error(out)
    expect(out).toMatch(/\d+ passed, 0 failed/)
    expect(r.exitCode).toBe(0)
  }, 120_000)
})
