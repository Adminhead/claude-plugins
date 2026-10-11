import { describe, expect, test } from 'claude-code/testing'
import { buildGit, MAX_BYTES, truncate } from '../hooks/git-tools/git'

const CWD = '/home/u/repo'
const argv = (tool: string, input: Record<string, unknown>) => {
  const b = buildGit(tool, input, CWD)
  if ('error' in b) throw new Error(b.error)
  return b.argv
}
const err = (tool: string, input: Record<string, unknown>) => {
  const b = buildGit(tool, input, CWD)
  return 'error' in b ? b.error : null
}

describe('buildGit', () => {
  test('log is hardened and defaults to 20 commits', () => {
    const a = argv('git_log', {})
    expect(a.slice(0, 6)).toEqual(['git', '-C', CWD, '--no-pager', '--no-lazy-fetch', '--literal-pathspecs'])
    expect(a).toContain('core.fsmonitor=false')
    expect(a).toContain('diff.external=')
    expect(a).toContain('--no-ext-diff')
    expect(a).toContain('--no-textconv')
    expect(a).toContain('--max-count=20')
    expect(a).not.toContain('--')
  })

  test('log passes rev before and path after --', () => {
    const a = argv('mcp__coremods__git_log', { rev: 'main..HEAD~2', path: 'src/a.ts', max_count: 3 })
    expect(a.slice(-3)).toEqual(['main..HEAD~2', '--', 'src/a.ts'])
    expect(a).toContain('--max-count=3')
  })

  test('env turns off system config and the pager', () => {
    const b: any = buildGit('git_log', {}, CWD)
    expect(b.env).toEqual({ GIT_CONFIG_NOSYSTEM: '1', GIT_PAGER: 'cat' })
  })

  test('revs that start with - or hold odd characters are rejected', () => {
    for (const rev of ['-p', '--output=x', '--all', 'a b', 'a;b', '$(x)', '', 'HEAD:file', 5]) {
      expect(err('git_log', { rev })).toMatch(/rev must match/)
      expect(err('git_show', { rev })).toMatch(/rev must match/)
    }
  })

  test('paths outside cwd are rejected, paths inside are made relative', () => {
    for (const path of ['../x', 'a/../../x', '/etc/passwd', '/home/u/repo-other/x', '']) {
      expect(err('git_show', { rev: 'HEAD', path })).toMatch(/outside|non-empty/)
    }
    expect(argv('git_show', { rev: 'HEAD', path: '/home/u/repo/a/../b.ts' }).slice(-2)).toEqual(['--', 'b.ts'])
    expect(argv('git_show', { rev: 'HEAD', path: './' }).slice(-2)).toEqual(['--', '.'])
  })

  test('max_count is capped, not clamped', () => {
    expect(err('git_log', { max_count: 101 })).toMatch(/max_count/)
    expect(err('git_log', { max_count: 0 })).toMatch(/max_count/)
    expect(err('git_log', { max_count: '3' })).toMatch(/max_count/)
  })

  test('log and show turn off signature display', () => {
    expect(argv('git_log', {})).toContain('--no-show-signature')
    expect(argv('git_show', { rev: 'HEAD' })).toContain('--no-show-signature')
  })

  test('blame defaults to HEAD so it never reads the worktree', () => {
    expect(argv('git_blame', { path: 'a.ts' }).slice(-3)).toEqual(['HEAD', '--', 'a.ts'])
  })

  test('paths that look like options or pathspec magic stay literal after --', () => {
    const a = argv('git_show', { rev: 'HEAD', path: '--output=x' })
    expect(a.slice(-3)).toEqual(['HEAD', '--', '--output=x'])
    expect(a).toContain('--literal-pathspecs')
    expect(argv('git_log', { path: ':(top)x' }).slice(-2)).toEqual(['--', ':(top)x'])
  })

  test('blame needs a path and takes a valid range', () => {
    expect(err('git_blame', {})).toBe('path is required')
    expect(argv('git_blame', { path: 'a.ts', start_line: 5, end_line: 9, rev: 'v1.0' })).toEqual(
      expect.arrayContaining(['blame', '-L', '5,9', 'v1.0', '--', 'a.ts']),
    )
    expect(argv('git_blame', { path: 'a.ts', start_line: 5 })).toContain('5,5')
    expect(err('git_blame', { path: 'a.ts', start_line: 9, end_line: 5 })).toMatch(/at least/)
    expect(err('git_blame', { path: 'a.ts', end_line: 5 })).toMatch(/start_line/)
  })

  test('show needs a rev; unknown tools fail', () => {
    expect(err('git_show', {})).toBe('rev is required')
    expect(err('git_push', {})).toMatch(/unknown tool/)
  })

  test('truncate cuts long output with a note', () => {
    expect(truncate('ok')).toBe('ok')
    const out = truncate('x'.repeat(MAX_BYTES + 5))
    expect(out.length).toBeLessThan(MAX_BYTES + 60)
    expect(out).toMatch(/\[truncated/)
  })
})

describe('git tool hook', () => {
  async function start($: any, on: any, run: (e: any) => any) {
    const calls: any[] = []
    on('session.cwd', async () => ({ value: CWD }))
    on('session.start', async () => ({ cwd: CWD }))
    on('process.run', async (_$: any, e: any) => {
      calls.push(e)
      return run(e)
    })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
    return calls
  }

  test('git_log runs the hardened argv and returns stdout', async ($, on) => {
    const calls = await start($, on, () => ({ value: { exitCode: 0, stdout: 'abc 2026-01-01 me  hi\n', stderr: '' } }))
    const out: any = await $.tool.call({ tool: 'mcp__coremods__git_log', max_count: 3 })
    expect(out.result).toBe('abc 2026-01-01 me  hi\n')
    expect(calls.at(-1).argv).toContain('--max-count=3')
  })

  test('a bad rev is an error string and git never runs', async ($, on) => {
    const calls = await start($, on, () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
    const out: any = await $.tool.call({ tool: 'mcp__coremods__git_show', rev: '--output=x' })
    expect(out.result).toMatch(/^error: rev must match/)
    expect(calls.filter(c => c.argv.includes('show'))).toEqual([])
  })

  test('a git failure comes back as text', async ($, on) => {
    await start($, on, () => ({ value: { exitCode: 128, stdout: '', stderr: 'fatal: bad revision\n' } }))
    const out: any = await $.tool.call({ tool: 'mcp__coremods__git_show', rev: 'nope' })
    expect(out.result).toBe('error: git exited 128: fatal: bad revision')
  })
})
