// Runs consult's shell and git pieces against real temp repos. The mod tests stub process.run, so this
// is the only check that git and sh behave as the argv and scripts assume. Run: bun test plugins/review/scripts
// (not named *.test.*: `claude plugin test` loads those as mod tests).
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { blockedFiles, diffArgv, fileListArgvs, PREFLIGHT, UNTRACKED_DIFF, validate, type Consult } from '../hooks/consult/consult'

const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'consult-spec-')))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const run = (argv: string[], cwd?: string) => {
  const r = spawnSync(argv[0]!, argv.slice(1), { cwd, env, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}
const git = (cwd: string, ...a: string[]) => run(['git', '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], cwd)
const preflight = (repo: string, session: string) => run(['sh', '-c', PREFLIGHT, 'sh', repo, session])
const put = (path: string, text = 'x\n') => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

let n = 0
function newRepo() {
  const dir = join(tmp, `repo${n++}`)
  mkdirSync(join(dir, 'sub'), { recursive: true })
  git(dir, 'init', '-q')
  put(join(dir, 'a.py'), 'x = 1\n')
  put(join(dir, 'sub', 'b.py'), 'y = 1\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'init')
  return dir
}
const consult = (over: Partial<Consult> = {}): Consult => {
  const r = validate({ cli: 'codex', mode: 'diff', model: 'gpt-6-sol', effort: 'high', ...over })
  if ('error' in r) throw new Error(r.error)
  return r.ok
}
// The files a default diff-mode call would send, as register.tsx collects them.
const sendList = (top: string, c = consult()) => fileListArgvs(c, top).map(a => run(a).out).join('\0')

describe('PREFLIGHT', () => {
  test('a session in a subdirectory defaults to the git toplevel', () => {
    const repo = newRepo()
    const r = preflight('', join(repo, 'sub'))
    expect(r.code).toBe(0)
    expect(r.out).toBe(`${repo}\n${repo}\n`)
  })

  test('an explicit subdirectory is kept, with the toplevel on the second line', () => {
    const repo = newRepo()
    expect(preflight(join(repo, 'sub'), repo).out).toBe(`${join(repo, 'sub')}\n${repo}\n`)
  })

  test('the opt-out marker at the root stops a call started in a subdirectory', () => {
    const repo = newRepo()
    put(join(repo, '.claude', 'no-external-review'), '')
    const r = preflight('', join(repo, 'sub'))
    expect(r.code).toBe(3)
    expect(r.err).toMatch(/external review disabled/)
  })

  test('a marker in an ancestor between the repo and the toplevel stops the call', () => {
    const repo = newRepo()
    put(join(repo, 'sub', '.claude', 'no-external-review'), '')
    expect(preflight(join(repo, 'sub', 'deeper'), repo).code).toBe(2)
    mkdirSync(join(repo, 'sub', 'deeper'))
    expect(preflight(join(repo, 'sub', 'deeper'), repo).code).toBe(3)
  })

  test('a worktree is stopped by the main checkout marker', () => {
    const repo = newRepo()
    const wt = join(tmp, `wt${n++}`)
    expect(git(repo, 'worktree', 'add', '-q', '-b', 'side', wt).code).toBe(0)
    const ok = preflight('', wt)
    expect(ok).toMatchObject({ code: 0, out: `${wt}\n${wt}\n` })
    put(join(repo, '.claude', 'no-external-review'), '')
    expect(preflight('', wt).code).toBe(3)
  })

  test('the repo must stay inside the session toplevel', () => {
    const repo = newRepo()
    const other = newRepo()
    for (const outside of [other, tmp, '/', join(repo, '..'), join(repo, 'sub', '..', '..')]) {
      const r = preflight(outside, repo)
      expect(r.code).toBe(2)
      expect(r.err).toMatch(/outside/)
    }
    expect(preflight(join(repo, 'missing'), repo).code).toBe(2)
  })

  test('outside git the session directory is the boundary, and a leading dash names a relative directory', () => {
    const plain = join(tmp, `plain${n++}`)
    mkdirSync(join(plain, 'sub'), { recursive: true })
    expect(preflight('', plain).out).toBe(`${plain}\n\n`)
    expect(preflight(join(plain, 'sub'), plain).code).toBe(0)
    expect(preflight(tmp, plain).code).toBe(2)
    mkdirSync(join(plain, '-x'))
    expect(preflight('-x', plain).out).toBe(`${join(plain, '-x')}\n\n`)
  })
})

describe('secret-file listing', () => {
  test('an untracked .env at the root is listed when the session started in a subdirectory', () => {
    const repo = newRepo()
    put(join(repo, '.env'), 'K=1\n')
    put(join(repo, 'sub', 'c.py'), 'z\n')
    const top = preflight('', join(repo, 'sub')).out.split('\n')[1]!
    expect(blockedFiles(sendList(top))).toEqual(['.env'])
  })

  test('non-ASCII and quoted names are listed raw, so the secret check sees them', () => {
    const repo = newRepo()
    for (const name of ['clé.pem', 'dé/.env', 'we"ird.pem', 'new\nline.key']) put(join(repo, name))
    expect(blockedFiles(sendList(repo)).sort()).toEqual(['clé.pem', 'dé/.env', 'new\nline.key', 'we"ird.pem'].sort())
  })

  test('a tracked secret that changed, a commit and a branch diff are all covered', () => {
    const repo = newRepo()
    put(join(repo, 'db', 'credentials.json'), '{}')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-qm', 'creds')
    expect(blockedFiles(sendList(repo, consult({ commit: 'HEAD' })))).toEqual(['db/credentials.json'])
    expect(blockedFiles(sendList(repo, consult({ base: 'HEAD~1' })))).toEqual(['db/credentials.json'])
    put(join(repo, 'a.py'), 'x = 2\n')
    expect(blockedFiles(sendList(repo))).toEqual([])
    expect(sendList(repo).split('\0').filter(Boolean)).toEqual(['a.py'])
  })

  test('.env.example is not blocked', () => {
    const repo = newRepo()
    put(join(repo, '.env.example'))
    expect(blockedFiles(sendList(repo))).toEqual([])
  })
})

describe('diff text', () => {
  test('the tracked diff and the untracked files both reach agy, run from the toplevel', () => {
    const repo = newRepo()
    put(join(repo, 'a.py'), 'x = 2\n')
    put(join(repo, 'sub', 'new "file".py'), 'fresh = 1\n')
    const tracked = run(diffArgv(consult(), repo)).out
    expect(tracked).toContain('+x = 2')
    const untracked = run(['sh', '-c', UNTRACKED_DIFF, 'sh', repo])
    expect(untracked.out).toContain('+fresh = 1')
    expect(untracked.out).toMatch(/new .*file.*\.py/)
  })

  test('a repo-configured external diff and pager do not run', () => {
    const repo = newRepo()
    const marker = join(tmp, `marker${n++}`)
    git(repo, 'config', 'diff.external', `touch ${marker}; true`)
    git(repo, 'config', 'core.pager', `touch ${marker}`)
    put(join(repo, 'a.py'), 'x = 3\n')
    run(diffArgv(consult(), repo))
    expect(run(['test', '-e', marker]).code).toBe(1)
  })
})
