import { describe, expect, test } from 'claude-code/testing'
import { parseNumstat, parseStatus, placeOf } from '../hooks/git-line/line'

const TOP = '/home/u/src/repo'

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
const DETACHED = '# branch.oid 0123456789abcdef\n# branch.head (detached)\n'

type Git = { top: number; status?: string; statusExit?: number; diff?: string } | Error

// Mounts the line on a session in `cwd` whose git answers per `git`.
async function mountLine($: any, on: any, cwd: string, git: () => Git, logs: string[] = []) {
  on('session.cwd', async () => ({ value: cwd }))
  on('process.run', async (_$: any, e: any) => {
    const g = git()
    if (g instanceof Error) return { deny: g.message }
    if (e.argv[1] === 'rev-parse') {
      return { value: { exitCode: g.top, stdout: g.top === 0 ? `${TOP}\n` : '', stderr: g.top ? 'fatal: not a git repository' : '' } }
    }
    if (e.argv[1] === 'diff') return { value: { exitCode: 0, stdout: g.diff ?? '', stderr: '' } }
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
    plugin: 'coremods',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  })
}

const rows = async (ui: any) => {
  const root = await ui.drawn()
  const walk = (n: any): string =>
    typeof n === 'string' ? n : (n.children ?? []).map(walk).join('')
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

describe('placeOf', () => {
  test('repo root, subdirectory, and outside a repo', async () => {
    expect(placeOf(TOP, TOP)).toBe('repo')
    expect(placeOf(`${TOP}/plugins/x`, TOP)).toBe('repo/plugins/x')
    expect(placeOf('/tmp/scratch', null)).toBe('/tmp/scratch')
    expect(placeOf('/link/repo/x', TOP)).toBe('/link/repo/x')
  })
})

describe('line', () => {
  test('draws under the engine hint with place, branch, and counts', async ($, on) => {
    const ui = await mountLine($, on, `${TOP}/hooks`, () => ({ top: 0, status: STATUS, diff: NUMSTAT }))
    const r = await rows(ui)
    expect(r.length).toBe(2)
    expect(r[1]).toBe('repo/hooks  ⎇ main ↑2 ↓1  conflict 1 staged 3 mod 2 new 2  lines +13 -2')
  })

  test('a clean repo shows a check', async ($, on) => {
    const ui = await mountLine($, on, TOP, () => ({ top: 0, status: CLEAN }))
    expect((await rows(ui))[1]).toBe('repo  ⎇ main  ✓')
  })

  test('outside a repo shows the cwd alone', async ($, on) => {
    const ui = await mountLine($, on, '/tmp/scratch', () => ({ top: 128 }))
    expect((await rows(ui))[1]).toBe('/tmp/scratch')
  })

  test('the line truncates instead of wrapping', async ($, on) => {
    const ui = await mountLine($, on, TOP, () => ({ top: 0, status: CLEAN }))
    const line = (await ui.findAll({ type: 'Text' })).find((el: any) => el.props.wrap)
    expect(line?.props.wrap).toBe('truncate-end')
  })

  test('a failing git keeps the last snapshot and logs once', async ($, on) => {
    let fail = false
    const logs: string[] = []
    const ui = await mountLine($, on, TOP, () => (fail ? { top: 0, statusExit: 128 } : { top: 0, status: CLEAN }), logs)
    fail = true
    await $.session.measure({ context: {} as any, rateLimits: [], changed: [] })
    await $.session.measure({ context: {} as any, rateLimits: [], changed: [] })
    await ui.redraw({ isDraft: false, isWorking: false, hint: '? for shortcuts' })
    expect((await rows(ui))[1]).toBe('repo  ⎇ main  ✓')
    expect(logs.filter(l => l.includes('bad index')).length).toBe(1)
  })
})
