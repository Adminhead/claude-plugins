import { describe, expect, test } from 'claude-code/testing'
import {
  aheadColor,
  countStashes,
  DEFAULT_THRESHOLDS,
  parseNumstat,
  parseRevParse,
  parseStatus,
  placeOf,
  thresholdsOf,
} from '../hooks/line'

const TOP = '/home/u/src/repo'
const MAIN_DIRS = `${TOP}\n${TOP}/.git\n${TOP}/.git\n`
const WT_TOP = '/home/u/src/repo-feature'
const WT_DIRS = `${WT_TOP}\n${TOP}/.git/worktrees/feature\n${TOP}/.git\n`

const STATUS = [
  '# branch.oid 0123456789abcdef0123456789abcdef01234567',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 M. N... 100644 100644 100644 aaa bbb hooks/a.ts',
  '1 .M N... 100644 100644 100644 aaa bbb hooks/b.ts',
  '1 MM N... 100644 100644 100644 aaa bbb hooks/c.ts',
  '2 R. N... 100644 100644 100644 aaa bbb R100 new.ts\told.ts',
  'u UU N... 100644 100644 100644 100644 aaa bbb ccc d.ts',
  '? notes.md',
  '? tmp/',
  '',
].join('\n')

const NUMSTAT = '10\t2\thooks/a.ts\n3\t0\thooks/b.ts\n-\t-\tlogo.png\n'

const CLEAN = '# branch.oid 0123456789abcdef\n# branch.head main\n'
const AHEAD = (n: number) => `# branch.oid 0123456789abcdef\n# branch.head main\n# branch.ab +${n} -0\n`
const DETACHED = '# branch.oid 0123456789abcdef\n# branch.head (detached)\n'
const STASHES = 'stash@{0}: WIP on main: abc fix\nstash@{1}: On main: try\n'

type Git = { dirs?: string; dirsExit?: number; status?: string; statusExit?: number; diff?: string; stash?: string } | Error

// Mounts the line on a session in `cwd` whose git answers per `git`.
async function mountLine($: any, on: any, cwd: string, git: () => Git, logs: string[] = []) {
  on('session.cwd', async () => ({ value: cwd }))
  on('process.run', async (_$: any, e: any) => {
    const g = git()
    if (g instanceof Error) return { deny: g.message }
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    if (e.argv[1] === 'rev-parse') {
      const exit = g.dirsExit ?? 0
      return { value: { exitCode: exit, stdout: exit ? '' : (g.dirs ?? MAIN_DIRS), stderr: exit ? 'fatal: not a git repository' : '' } }
    }
    if (e.argv[1] === 'diff') return ok(g.diff ?? '')
    if (e.argv[1] === 'stash') return ok(g.stash ?? '')
    return { value: { exitCode: g.statusExit ?? 0, stdout: g.status ?? '', stderr: g.statusExit ? 'fatal: bad index' : '' } }
  })
  // Stands in for the engine's hint line beneath the mod.
  on('ui.render', { component: 'PromptHint' }, async ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{e.props.hint}</Text>
  })
  on('session.start', async () => ({ cwd }))
  on('session.measure', async () => ({ changed: [] }))
  on('ui.log', async (_$: any, e: any) => {
    logs.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd, surface: 'terminal', isInteractive: true })
  return $.ui.mount({
    plugin: 'git-statusline',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  })
}

const rows = async (ui: any) => {
  const root = await ui.drawn()
  const walk = (n: any): string => (typeof n === 'string' ? n : (n.children ?? []).map(walk).join(''))
  return root.props?.flexDirection === 'column' ? root.children.map(walk) : [walk(root)]
}

describe('parseStatus', () => {
  test('counts staged, modified, untracked, conflicts and ahead/behind', async () => {
    expect(parseStatus(STATUS)).toEqual({
      branch: 'main', ahead: 2, behind: 1, staged: 3, modified: 2, untracked: 2, conflicts: 1,
    })
  })

  test('detached HEAD shows the short oid', async () => {
    expect(parseStatus(DETACHED).branch).toBe('(0123456)')
  })

  test('no upstream means no ahead/behind', async () => {
    const s = parseStatus(CLEAN)
    expect([s.ahead, s.behind]).toEqual([0, 0])
  })
})

describe('parseNumstat', () => {
  test('sums added and deleted lines, skipping binary files', async () => {
    expect(parseNumstat(NUMSTAT)).toEqual({ added: 13, deleted: 2 })
    expect(parseNumstat('')).toEqual({ added: 0, deleted: 0 })
  })
})

describe('parseRevParse', () => {
  test('main worktree has no marker', async () => {
    expect(parseRevParse(MAIN_DIRS)).toEqual({ top: TOP, worktree: null })
  })

  test('a linked worktree is named from its git dir', async () => {
    expect(parseRevParse(WT_DIRS)).toEqual({ top: WT_TOP, worktree: 'feature' })
  })

  test('a trailing slash does not count as a difference', async () => {
    expect(parseRevParse(`${TOP}\n${TOP}/.git/\n${TOP}/.git\n`)?.worktree).toBeNull()
  })

  test('relative or missing paths are rejected', async () => {
    expect(parseRevParse('.git\n.git\n')).toBeNull()
    expect(parseRevParse('')).toBeNull()
  })
})

describe('stash, place and thresholds', () => {
  test('countStashes counts entries', async () => {
    expect(countStashes(STASHES)).toBe(2)
    expect(countStashes('')).toBe(0)
  })

  test('placeOf: repo root, subdirectory, and outside a repo', async () => {
    expect(placeOf(TOP, TOP)).toBe('repo')
    expect(placeOf(`${TOP}/plugins/x`, TOP)).toBe('repo/plugins/x')
    expect(placeOf('/tmp/scratch', null)).toBe('/tmp/scratch')
    expect(placeOf('/link/repo/x', TOP)).toBe('/link/repo/x')
  })

  test('aheadColor grades by threshold; 0 turns a level off', async () => {
    expect(aheadColor(1, DEFAULT_THRESHOLDS)).toBe('success')
    expect(aheadColor(5, DEFAULT_THRESHOLDS)).toBe('warning')
    expect(aheadColor(20, DEFAULT_THRESHOLDS)).toBe('error')
    expect(aheadColor(100, { warning: 0, critical: 0 })).toBe('success')
  })

  test('thresholdsOf reads options and ignores bad values', async () => {
    expect(thresholdsOf({ push_warning_threshold: 3, push_critical_threshold: 9 })).toEqual({ warning: 3, critical: 9 })
    expect(thresholdsOf({ push_warning_threshold: -1, push_critical_threshold: 'x' })).toEqual(DEFAULT_THRESHOLDS)
    expect(thresholdsOf(undefined)).toEqual(DEFAULT_THRESHOLDS)
  })
})

describe('line', () => {
  test('draws under the engine hint with place, branch, counts and stashes', async ($, on) => {
    const ui = await mountLine($, on, `${TOP}/hooks`, () => ({ status: STATUS, diff: NUMSTAT, stash: STASHES }))
    const r = await rows(ui)
    expect(r.length).toBe(2)
    expect(r[0]).toBe('? for shortcuts')
    expect(r[1]).toBe('repo/hooks  ⎇ main ↑2 ↓1  conflict 1 staged 3 mod 2 new 2  lines +13 -2  stash 2')
  })

  test('a clean repo shows a check', async ($, on) => {
    const ui = await mountLine($, on, TOP, () => ({ status: CLEAN }))
    expect((await rows(ui))[1]).toBe('repo  ⎇ main  ✓')
  })

  test('a linked worktree shows its marker', async ($, on) => {
    const ui = await mountLine($, on, WT_TOP, () => ({ dirs: WT_DIRS, status: CLEAN }))
    expect((await rows(ui))[1]).toBe('repo-feature  ⎇ wt:feature main  ✓')
  })

  test('many unpushed commits colour the ahead count', async ($, on) => {
    const ui = await mountLine($, on, TOP, () => ({ status: AHEAD(25) }))
    const ahead = (await ui.findAll({ type: 'Text' })).find((el: any) => el.children?.[0] === ' ↑25')
    expect(ahead?.props.color).toBe('error')
  })

  test('outside a repo shows the cwd alone', async ($, on) => {
    const ui = await mountLine($, on, '/tmp/scratch', () => ({ dirsExit: 128 }))
    expect((await rows(ui))[1]).toBe('/tmp/scratch')
  })

  test('the line truncates instead of wrapping', async ($, on) => {
    const ui = await mountLine($, on, TOP, () => ({ status: CLEAN }))
    const line = (await ui.findAll({ type: 'Text' })).find((el: any) => el.props.wrap)
    expect(line?.props.wrap).toBe('truncate-end')
  })

  test('a failing git keeps the last snapshot and logs once', async ($, on) => {
    let fail = false
    const logs: string[] = []
    const ui = await mountLine($, on, TOP, () => (fail ? { statusExit: 128 } : { status: CLEAN }), logs)
    fail = true
    await $.session.measure({ context: {} as any, rateLimits: [], changed: [] })
    await $.session.measure({ context: {} as any, rateLimits: [], changed: [] })
    await ui.redraw({ isDraft: false, isWorking: false, hint: '? for shortcuts' })
    expect((await rows(ui))[1]).toBe('repo  ⎇ main  ✓')
    expect(logs.filter(l => l.includes('git-statusline: fatal: bad index')).length).toBe(1)
  })
})
