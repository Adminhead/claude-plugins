import { describe, expect, test } from 'bun:test'
import { commandNamesPlans, isUnder, MAX_GUARD_COMMAND, normalizePath, plansRoot, writtenPath } from '../hooks/plan/guard'

const HOME = '/home/u'

describe('normalizePath', () => {
  test('folds dots and slashes, takes a relative path from cwd and ~ from home', () => {
    expect(normalizePath('/a//b/./c/../d', '/cwd', HOME)).toBe('/a/b/d')
    expect(normalizePath('x/y', '/cwd', HOME)).toBe('/cwd/x/y')
    expect(normalizePath('../../etc', '/a/b', HOME)).toBe('/etc')
    expect(normalizePath('~/.claude/z', '/cwd', HOME)).toBe('/home/u/.claude/z')
    expect(normalizePath('/../..', '/cwd', HOME)).toBe('/')
  })
})

describe('isUnder', () => {
  const root = plansRoot(HOME)
  test('the root, its children, and not a sibling that shares the prefix', () => {
    expect(root).toBe('/home/u/.claude/adminhead-plans')
    expect(isUnder(root, root)).toBe(true)
    expect(isUnder(`${root}/k/p.json`, root)).toBe(true)
    expect(isUnder(`${root}-notes/p.json`, root)).toBe(false)
    expect(isUnder('/home/u/.claude', root)).toBe(false)
  })
  test('plansRoot ignores a trailing slash on home', () => {
    expect(plansRoot('/home/u/')).toBe(root)
  })
})

describe('commandNamesPlans', () => {
  test('names the directory in the spellings a shell command uses', () => {
    for (const c of [
      'cat /home/u/.claude/adminhead-plans/k/p.json',
      'rm -rf ~/.claude/adminhead-plans',
      'echo > "$HOME/.claude//adminhead-plans/k/p.jsonl"',
      'ls .claude/./adminhead-plans',
    ]) {
      expect([c, commandNamesPlans(c)]).toEqual([c, true])
    }
  })
  test('other commands pass, including ones that mention the name outside the directory path', () => {
    for (const c of ['git status', 'ls ~/.claude', 'grep adminhead-plans README.md', 'cat .claude/settings.json']) {
      expect([c, commandNamesPlans(c)]).toEqual([c, false])
    }
  })
  test('a command over the cap is denied when it contains the name at all, else passes', () => {
    const pad = 'a'.repeat(MAX_GUARD_COMMAND)
    expect(commandNamesPlans(`${pad} adminhead-plans`)).toBe(true)
    expect(commandNamesPlans(`${pad} ls`)).toBe(false)
  })
  test('hostile input of the cap length is matched in bounded time', () => {
    const hostile = `.claude${'/'.repeat(MAX_GUARD_COMMAND - 7)}`
    const t = Date.now()
    expect(commandNamesPlans(hostile)).toBe(false)
    expect(Date.now() - t).toBeLessThan(200)
  })
})

describe('writtenPath', () => {
  test('reads file_path for Write and Edit and notebook_path for NotebookEdit', () => {
    expect(writtenPath({ tool: 'Write', file_path: '/a' })).toBe('/a')
    expect(writtenPath({ tool: 'Edit', file_path: '/b' })).toBe('/b')
    expect(writtenPath({ tool: 'NotebookEdit', notebook_path: '/n' })).toBe('/n')
    expect(writtenPath({ tool: 'NotebookEdit', file_path: '/x' })).toBeNull()
    expect(writtenPath({ tool: 'Write' })).toBeNull()
    expect(writtenPath({ tool: 'Write', file_path: '' })).toBeNull()
  })
})
